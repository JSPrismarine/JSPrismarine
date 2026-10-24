# How feasible is it to hold Java-shaped game state and present it to a vanilla Bedrock client?

Researched 2026-10-24. The evidence base is GeyserMC, which has done exactly this translation in production since 2019: the Geyser source at commit `dd1fab334b5591012e9f41d1e17f50297ec51a69` (2026-10-23, version `2.12.0-SNAPSHOT`), the `GeyserMC/mappings` data at commit `81700ab543c1f4e9f9041f58dac4154ecb0d0c8b` (2026-10-13, "Update mappings for Minecraft JE 26.3"), Geyser's own documentation and issue labels, and the Bedrock palettes Geyser bundles. Java-side counts come from Mojang's own 26.3 data generator output in `/tmp/bds-research-java/out/generated/` (the same run as [java-datapacks.md](java-datapacks.md)). Bedrock-side counts come from the 1.26.50 block palette, item list and entity identifier list that Geyser captured from the client. Builds on [java-datapacks.md](java-datapacks.md) and [cross-edition-worldgen-parity.md](cross-edition-worldgen-parity.md) and does not repeat them. Every claim names its source. Minecraft Wiki content is marked non-primary. Nothing here is legal advice.

Version context verified against primary sources, not memory: the current Java release is 26.3 and the current snapshot is 26.4-snapshot-5 (`https://launchermeta.mojang.com/mc/game/version_manifest_v2.json`). Geyser's README table says it supports Java 26.3 and Bedrock 26.30 through 26.52; `GameProtocol.java` registers four Bedrock codecs (v1001, v2168_hotfix4, v2169, v2193) across those 14 Bedrock versions.

## Summary

1. The translation is total, not partial. Every one of Java 26.3's 35723 block states resolves to a real entry in Bedrock 1.26.50's 22091-state palette; `BlockRegistryPopulator` throws at startup if any does not. Nothing falls through. But 35723 Java states collapse onto 15953 distinct Bedrock states, and 13585 Bedrock states receive more than one Java state.
2. The collapse is mostly benign. Of the 2313 (block, property) pairs in Java 26.3, 671 are indistinguishable in the Bedrock block state. 504 of those are `waterlogged` and come back through Bedrock's second block storage layer, leaving 167. 33 of the 167 are recomputed by the Bedrock client (fence and wall connections, `snowy`, leaves `distance`) and 42 are carried in Bedrock block entity NBT (skull `rotation`, shulker `facing`, chest `type`, `copper_golem_pose`), leaving about 92, of which 72 are `powered` on doors, trapdoors, fence gates and heads and render in neither edition. Exactly 5 Java block states, `test_block` (4) and `test_instance_block` (1), have no Bedrock concept and map to `minecraft:unknown`.
3. Geyser does not read Java's datapack. It hardcodes a Java block registry in Java source: `Blocks.java` is 3668 lines with 1286 `register(new Block(...))` calls, exactly matching Mojang's 1286 blocks, and carries `destroyTime`, `requiresCorrectToolForDrops` and `pushReaction` as literals. A Java-data-driven server would get this part for free, which Geyser does not.
4. Items are nearly 1:1 by identifier. 1658 Java items map to 1606 distinct Bedrock identifiers; only 8 Bedrock identifiers take more than one Java item (60 Java items), and the genuinely lossy merges are `spectral_arrow` and `tipped_arrow` onto `arrow`, `debug_stick` onto `stick`, `knowledge_book` onto `book`, `furnace_minecart` onto `hopper_minecart`, and the two test blocks onto `unknown`.
5. The data component system (1.20.5+) survives better than expected. Geyser's source references all 122 Java data component types. The lossy part is the rendering: Java-only facts become lore strings. Unbreakable becomes a blue `item.unbreakable` line, attribute modifiers become lore lines, and a non-vanilla enchantment becomes a lore line plus a forced glint with no gameplay signal to the client. Of Java's 43 enchantments, 42 have a Bedrock id; only `sweeping_edge` does not.
6. Entities degrade more than blocks or items. Java has 161 entity types, Bedrock's `entity_identifiers.dat` lists 136, and 112 names match exactly. 2 Java types (`block_display`, `item_display`) have no Geyser representation at all. 10 Java types are rendered as a different Bedrock entity (`text_display` and `interaction` as armor stands, `giant` as a zombie, `illusioner` as an evoker, and so on). 61 of the 230 metadata translators in `VanillaEntities.java` are explicit `addTranslator(null)` drops.
7. Attributes are the worst domain. Java has 40 attributes. Geyser names 20, and only 10 of those carry a Bedrock identifier to send. The other 20 (including `gravity`, `step_height`, `safe_fall_distance`, `entity_interaction_range`, `sweeping_damage_ratio`, `max_absorption`) are absent from Geyser entirely and therefore invisible to the client.
8. The creative menu, biome definitions, entity identifiers and camera presets sent to the Bedrock client are all captured Bedrock data, not derived from the Java server. Geyser ships Bedrock's own `creative_items.26_50.json` (1980 items, 124 groups), `stripped_biome_definitions.json` (88 Bedrock biomes) and `entity_identifiers.dat`. A datapack-added Java biome with no mapping falls back to `ocean`, `nether_wastes` or `the_end` by dimension.
9. Geyser publishes a list of 24 things it calls unfixable, 8 more that only a bundled Bedrock resource pack fixes, and 1 that needs a Java-server mod. The GitHub labels `Can't Fix` (7 open, 77 total), `Missing Client Feature` (10 open, 46 total) and `Client Bug` (7 open, 52 total) hold the rest.
10. Both Geyser and `GeyserMC/mappings` are MIT, with an explicit disclaimer that Mojang data is not relicensed. An MPL-2.0 project can depend on or vendor both, keeping the MIT notice on vendored files. MPL section 3.3 covers the combination.
11. Nobody else does this direction. Geyser is the only working Java-server-state to Bedrock-client translator; its predecessor DragonProxy is archived at Bedrock 1.5.3 / Java 1.12.2. The reverse direction (ViaBedrock, Java client to Bedrock server) is at `0.0.31-SNAPSHOT` after four years with inventory and block breaking unimplemented.
12. The honest fraction: a Bedrock client can see about 96 percent of Java's block state distinctions, almost all item identity, most item tooltip facts as text rather than mechanics, 93 percent of entity types but only 73 percent of their metadata and 25 percent of their attributes. What it cannot see at all is anything that depends on a client-side rule Bedrock hardcodes: mining speed, beacon base blocks, climbable blocks, custom enchantment effects, elytra gliding conditions, furnace cook times, left-versus-right click, and build heights beyond Bedrock's fixed per-dimension limits.

## 1. Geyser's architecture

### Size and activity

| Measure | Value | Command |
|---|---|---|
| Java source files | 1382 | `find . -name '*.java' \| wc -l` |
| Lines of Java | 170191 | `find . -name '*.java' \| xargs wc -l` |
| Lines in `core/` alone | 133452 across 1040 files | same, scoped to `core/src/main/java` |
| Commits since 2019-07-08 | 5079 | `git rev-list --count HEAD` |
| Commits in the last 12 months | 586 | `git rev-list --count --since=2025-10-24 HEAD` |
| Stars / forks / open issues | 5928 / 931 / 337 | `https://api.github.com/repos/GeyserMC/Geyser` |
| License | MIT | `https://api.github.com/repos/GeyserMC/Geyser` |

`GeyserMC/mappings` has 422 commits total and 14 in the last 12 months, roughly one per Minecraft release.

### Where Java state is held

Per connected Bedrock player, Geyser keeps a `GeyserSession` (`core/src/main/java/org/geysermc/geyser/session/GeyserSession.java`, 2773 lines, 142 private fields) plus 19 classes directly under `session/cache/`:

`AdvancementsCache`, `BlockBreakHandler`, `BookEditCache`, `BossBar`, `BundleCache`, `ChunkCache`, `ComponentCache`, `EntityCache`, `EntityEffectCache`, `FormCache`, `InputCache`, `LodestoneCache`, `PistonCache`, `PreferencesCache`, `SkullCache`, `StructureBlockCache`, `TeleportCache`, `WorldBorder`, `WorldCache`, plus `cache/registry/` (`RegistryCache`, `TagCache`, `JavaRegistryTagCache`) and `cache/waypoint/`.

That is the Java-shaped state: Geyser holds a mirror of the Java server's world, inventories, entities and registries, and re-derives a Bedrock view from it on every change. A server that owns the state directly skips the mirroring but inherits every derivation.

Static, cross-session Java data lives in `registry/` (115 files) and `level/block/` (`Blocks.java`, `BlockState.java`, `property/`), and is loaded once at boot.

### Where translation happens

Translators per domain, counted with `find <dir> -name '*.java' | wc -l`:

| Package | Files | What it covers |
|---|---|---|
| `translator/protocol/` | 161 | packet translation (see breakdown below) |
| `translator/inventory/` | 34 | container UIs |
| `translator/level/` | 30 | chunks, biomes, block entities (25 of the 30) |
| `translator/collision/` | 14 | Java collision shapes the Bedrock client gets wrong |
| `translator/sound/` | 11 | interaction and block sounds |
| `translator/item/` | 3 | item stacks and components |
| `translator/text/` | 2 | chat components |
| `translator/entity/` | 1 | entity metadata dispatch |

`translator/protocol/` splits into 122 Java-to-Bedrock translators and 37 Bedrock-to-Java translators, plus two base classes. 158 files carry the `@Translator` annotation. The Java side subdivides: `java/entity/` 39, `java/level/` 28, `java/inventory/` 10, `java/title/` 5, `java/scoreboard/` 5, `java/dialogues/` 3, and 32 at the package root.

Entity behavior lives outside the translator tree: `entity/type/` holds 146 classes, `entity/properties/` 9, `entity/vehicle/` 8. `item/` holds 100 files including 29 item subclasses under `item/type/`. `inventory/` holds 43, `level/` 65.

### Packet coverage

Mojang's `reports/packets.json` for 26.3 lists 144 clientbound play packets and 21 clientbound configuration packets, 165 in all. Geyser has 122 clientbound translator classes and an explicit `IGNORED_PACKETS` list of 31 entries in `registry/PacketTranslatorRegistry.java`. Nine of those sit under the comment `/// Unable to implement on bedrock`:

```java
/// Unable to implement on bedrock
IGNORED_PACKETS.add(ClientboundTabListPacket.class);
IGNORED_PACKETS.add(ClientboundPostEffectsPacket.class);
IGNORED_PACKETS.add(ClientboundPlaceGhostRecipePacket.class);
IGNORED_PACKETS.add(ClientboundRecipeBookSettingsPacket.class);
IGNORED_PACKETS.add(ClientboundResetChatPacket.class); // I think
IGNORED_PACKETS.add(ClientboundCommandSuggestionsPacket.class); // I think
IGNORED_PACKETS.add(ClientboundCustomChatCompletionsPacket.class); // I think
IGNORED_PACKETS.add(ClientboundDeleteChatPacket.class); // I think

IGNORED_PACKETS.add(ClientboundTestInstanceBlockStatus.class);
```

Others are ignored because Bedrock does the work itself (`ClientboundLightUpdatePacket` with the comment "Light is handled on Bedrock for us") or because the information has no use (`ClientboundServerDataPacket`, "Just MOTD and server icon").

### Geyser hardcodes Java's block registry

`core/src/main/java/org/geysermc/geyser/level/block/Blocks.java` is 3668 lines with 1286 `register(new Block(...))` calls, exactly Mojang's 1286 blocks. The physical properties are literals:

```java
public static final Block STONE = register(new Block("stone", builder().requiresCorrectToolForDrops().destroyTime(1.5f)));
```

This is the part a data-driven Java-parity server does not have to write, because Java's datapack and default item components supply it. It is also the part Geyser has to re-hand-maintain every Minecraft release.

## 2. Block state mapping

### The mapping format

`core/src/main/resources/mappings` is a git submodule pointing at `https://github.com/GeyserMC/mappings.git` (`.gitmodules`). The block file is `blocks.nbt`: gzipped big-endian Java NBT (`1f 8b` magic) holding one compound with a single key `bedrock_mappings`, a list of 35723 entries indexed positionally by Java block state id.

Each entry has at most two keys: `state` (present in 33738 entries), the Bedrock property compound, and `bedrock_identifier` (present in 3824 entries), used only when the Bedrock name differs from the Java path. An empty compound means "same name, no properties". Examples at indices 0, 22, 90 and 680:

```json
{}
{"state": {"pillar_axis": "x"}}
{"bedrock_identifier": "flowing_water", "state": {"liquid_depth": 1}}
{"bedrock_identifier": "noteblock"}
```

The resolution rule is five lines, in `BlockRegistryPopulator.buildBedrockState`:

```java
private static NbtMap buildBedrockState(BlockState state, NbtMap nbt) {
    NbtMapBuilder tagBuilder = NbtMap.builder();
    String bedrockIdentifier = "minecraft:" + nbt.getString("bedrock_identifier", state.block().javaIdentifier().value());
    tagBuilder.putString("name", bedrockIdentifier);
    tagBuilder.put("states", nbt.getCompound("state"));
    return tagBuilder.build();
}
```

The resulting `{name, states}` compound is looked up in the Bedrock palette loaded from `core/src/main/resources/bedrock/block_palette.26_50.nbt`, which Geyser captured from the client. A miss is fatal:

```java
if (bedrockDefinition == null) {
    throw new RuntimeException("""
        Unable to find %s Bedrock runtime ID for %s! ...
```

Two consequences matter for a reimplementation. First, the file carries no Java identifiers at all, so a consumer must independently know Java 26.3's block state ordering. Mojang's `reports/blocks.json` supplies exactly that, and joining the two is how every count below was produced. Second, the mapping is tied to a specific Bedrock palette; Geyser bundles three (26.30, 26.40, 26.50) and runs two of them through a `WildernessBoundConverter` remapper.

### The numbers

| Side | Blocks or identifiers | States | Source |
|---|---|---|---|
| Java 26.3 | 1286 | 35723 | `reports/blocks.json` |
| Bedrock 1.26.50 | 1477 | 22091 | `bedrock/block_palette.26_50.nbt` |
| Java states reaching Bedrock | 1286 | 35723 of 35723 | `blocks.nbt` joined to `blocks.json` |
| Distinct Bedrock states reached | 1295 names | 15953 | same |
| Bedrock states never reached | 182 names | 6138 | same |

Every one of the 15953 distinct targets is present in the 22091-entry palette. Zero misses, which the throw above guarantees at Geyser's startup and this note confirmed offline.

### How much the collapse costs

13585 Bedrock states receive more than one Java state, covering 33355 of the 35723. 679 of the 1286 Java blocks map injectively; 607 do not. The heaviest collapses:

| Java block | Java states | Distinct Bedrock states |
|---|---|---|
| `note_block` | 1350 | 1 |
| `redstone_wire` | 1296 | 16 |
| `fire` | 512 | 16 |
| `calibrated_sculk_sensor` | 384 | 12 |
| `sculk_sensor` | 96 | 3 |
| `chorus_plant` | 64 | 1 |
| `mushroom_stem` | 64 | 3 |
| each of the 7 skull and head blocks | 32 | 1 |
| each of the 14 leaves blocks | 28 | 2 |
| `moving_piston` | 12 | 1 |

State counts overstate the loss, because a Java block state is a cross product and the collapse often removes one axis. The honest measure is which Java properties disappear. Of the 2313 (block, property) pairs in Java 26.3, 671 are not recoverable from the Bedrock state alone:

| Java property | Blocks affected | Where the information goes |
|---|---|---|
| `waterlogged` | 504 | Bedrock's second block storage layer (below) |
| `powered` | 72 | nowhere; not visual on doors, trapdoors, fence gates or heads |
| `facing` | 18 (all shulker boxes, `moving_piston`) | `ShulkerBoxBlockEntityTranslator` writes `facing` into Bedrock block entity NBT |
| `distance` | 14 (all leaves) | nowhere; not visual |
| `type` | 11 (all chests, `moving_piston`) | `DoubleChestBlockEntityTranslator` computes the pair position into block entity NBT |
| `copper_golem_pose` | 8 | `CopperBlockEntityTranslator` writes `Pose` into block entity NBT, with the comment "Copper golem poses are set through block states on Java and through NBT on bedrock" |
| `rotation` | 7 (all skulls and heads) | `SkullBlockEntityTranslator` writes `Rotation` as `rotation * 22.5f` |
| `power` | 3 (`sculk_sensor`, `calibrated_sculk_sensor`, `target`) | nowhere |
| `north`/`south`/`east`/`west` | 3 each (`chorus_plant`, `fire`, `redstone_wire`) | the Bedrock client computes connections itself |
| `up` | 3 (`chorus_plant`, `fire`, `vine`) | same |
| `snowy` | 3 (`grass_block`, `mycelium`, `podzol`) | the Bedrock client computes it itself |
| `stage`, `signal_fire`, `extended` | 2 each | nowhere |
| `down`, `cracked`, `has_record`, `has_book`, `instrument`, `note`, `short`, `locked`, `bottom`, `mode` | 1 each | block entity or nowhere |

Removing `waterlogged` leaves 167 pairs. 33 of those the Bedrock client recomputes from neighbors: the six connection properties on `chorus_plant`, `fire`, `redstone_wire` and `vine`, plus `snowy` on three blocks and `distance` on the 14 leaves. 42 Geyser routes through block entity NBT: `facing` on the 17 shulker boxes, `type` on the 10 chests, `copper_golem_pose` on 8, `rotation` on the 7 skulls. That leaves about 92 pairs that genuinely do not reach the client, and 72 of them are `powered` on doors, trapdoors, fence gates and heads, which neither edition renders. That is the real cost of block state translation, and it is small.

### Waterlogging

Bedrock has no waterlogged flag. It has a second block storage layer per sub-chunk. Geyser precomputes a BitSet over Java state ids:

```java
/**
 * A registry containing all the waterlogged blockstates.
 * Properties.WATERLOGGED should not be relied on for two reasons:
 * - Custom blocks
 * - Seagrass, kelp, and bubble columns are assumed waterlogged and don't have a waterlogged property
 */
public static final SimpleRegistry<BitSet> WATERLOGGED = SimpleRegistry.create(RegistryLoaders.empty(BitSet::new));
```

`JavaLevelChunkWithLightTranslator` then emits a second `BlockStorage` whose palette is `[air, water]` and whose bit array marks the waterlogged positions. Single-block updates go through `BlockUtils`, which sends a second `UpdateBlockPacket` on data layer 1.

### Java blocks renamed or merged

284 Java blocks get a different Bedrock identifier. Most are rote renames (`cobweb` to `web`, `dirt_path` to `grass_path`, `bricks` to `brick_block`, `dead_bush` to `deadbush`, `end_stone_bricks` to `end_bricks`, `frogspawn` to `frog_spawn`, `flowering_azalea_leaves` to `azalea_leaves_flowered`). Three families are structural:

- Slabs. Java puts `type=double` in the block state; Bedrock has a separate `*_double_slab` block. 118 Java blocks map to more than one Bedrock identifier, and 101 of them are slabs.
- Lit variants. `furnace`/`lit_furnace`, `smoker`/`lit_smoker`, `blast_furnace`/`lit_blast_furnace`, `redstone_ore`/`lit_redstone_ore`, `redstone_lamp`/`lit_redstone_lamp`, `redstone_torch`/`unlit_redstone_torch`, `repeater` to `powered_repeater`/`unpowered_repeater`, `comparator` to `powered_comparator`/`unpowered_comparator`, `daylight_detector`/`daylight_detector_inverted`.
- Light blocks. Java's `light[level=N]` becomes 16 separate Bedrock blocks `light_block_0` through `light_block_15`.

40 Bedrock identifiers receive more than one Java block. The large merges are `flower_pot` (41 Java blocks: the pot plus 40 potted variants, with the contents carried in block entity NBT), `bed` (16 colors), `standing_banner` (16), `wall_banner` (16), `cauldron` (4: empty, water, lava, powder snow), and `air` (3: `air`, `cave_air`, `void_air`). Wall variants merge into the floor variant for 13 hanging sign woods, 7 skulls, 4 torch types, and both stems with their `attached_` forms.

### Java-only blocks

Exactly two, carrying five states between them:

```
minecraft:test_block        -> minecraft:unknown  (4 states)
minecraft:test_instance_block -> minecraft:unknown (1 state)
```

Geyser's limitations page lists this as "Test instance blocks are not available in Bedrock ([GeyserMC/Geyser#6164](https://github.com/GeyserMC/Geyser/issues/6164))" (`https://geysermc.org/wiki/geyser/current-limitations/`).

### Bedrock-only blocks

182 of Bedrock 1.26.50's 1477 identifiers, covering 6138 palette states, are never the target of any Java state. They fall into five groups:

- Education Edition chemistry, 126 identifiers: `element_0` through `element_118`, `compound_creator`, `element_constructor`, `lab_table`, `material_reducer`, `chemical_heat`, `underwater_torch`, `underwater_tnt`.
- Education or Bedrock-only building blocks, 35: `hard_glass`, `hard_glass_pane`, and the 32 `hard_*_stained_glass` and `hard_*_stained_glass_pane` variants, plus the four `colored_torch_*`.
- Command and world-building blocks with no Java equivalent, 5: `allow`, `deny`, `border_block`, `camera`, `chalkboard`.
- Legacy and internal, 9: `netherreactor`, `glowingobsidian`, `info_update`, `info_update2`, `invisible_bedrock`, `reserved6`, `deprecated_anvil`, `deprecated_purpur_block_1`, `deprecated_purpur_block_2`, `client_request_placeholder_block`.
- Things Java models differently, 3: `frame` and `glow_frame` (item frames are entities on Java; Geyser models them as blocks with an `itemFrameCache` on the session), and `stonecutter` (the legacy Bedrock one; Java's stonecutter maps to Bedrock `stonecutter_block`).

### Collision

`collisions.nbt` and `block_shapes.nbt` each carry 35723 indices keyed by Java block state id, pointing into 338 and 873 distinct shapes. Geyser therefore runs Java's collision server-side (`level/physics/CollisionManager.java`) rather than trusting the Bedrock client. Ten `@CollisionRemapper` classes under `translator/collision/fixes/` patch the families where Bedrock's own client collision disagrees with Java's: lanterns, chests, bells, trapdoors, end portal frames, glass panes and iron bars, doors, sea pickles, conduits and scaffolding. `SolidCollision` covers shulker boxes with the note "These have no collision in the mappings as it depends on the NBT data".

Geyser also publishes a hand-curated Java behavior table in `interactions.json` (589 KB, `data_version 5023`) with two block state lists, `always_consumes` and `requires_may_build`, both spelled out per state string.

## 3. Item mapping and the data component system

### Identifier mapping

`items.json` holds 1658 entries, exactly Mojang's 1658 items (`reports/minecraft/components/item/` has one file per item). The fields and how often they appear:

| Field | Entries | Meaning |
|---|---|---|
| `bedrock_identifier` | 1658 | the Bedrock item name |
| `is_block`, `firstBlockRuntimeId`, `lastBlockRuntimeId` | 1141 | block items, with the Bedrock runtime id range they place |
| `bedrock_data` | 202 | the legacy Bedrock damage value that selects a sub-item |
| `is_entity_placer` | 117 | boats, spawn eggs, buckets with entities |

98 Java items get a different Bedrock identifier. 1606 distinct Bedrock identifiers are used. Only 8 Bedrock identifiers take more than one Java item, covering 60 Java items:

| Bedrock item | Java items |
|---|---|
| `filled_map` | 17 (`map`, plus 16 structure locator maps such as `buried_treasure_map`, `abandoned_camp_map`) |
| `banner` | 16 dyed banners |
| `bed` | 16 dyed beds |
| `arrow` | `arrow`, `spectral_arrow`, `tipped_arrow` |
| `book` | `book`, `knowledge_book` |
| `stick` | `stick`, `debug_stick` |
| `hopper_minecart` | `hopper_minecart`, `furnace_minecart` |
| `unknown` | `test_block`, `test_instance_block` |

Banners and beds recover their color from Bedrock NBT, and tipped arrows from potion NBT, so the first three rows are not real losses. `spectral_arrow`, `debug_stick`, `knowledge_book` and `furnace_minecart` are: a Bedrock player sees a plain arrow, a plain stick, a plain book and a hopper minecart. Geyser's config can restore the furnace minecart as a custom item (see section 8).

Other renames worth knowing, because they show the shape of the problem: `jack_o_lantern` to `lit_pumpkin`, `lily_pad` to `waterlily`, `terracotta` to `hardened_clay`, `powered_rail` to `golden_rail`, `snow` to `snow_layer` and `snow_block` to `snow` (a swap, not a rename), `shulker_box` to `undyed_shulker_box`, `zombified_piglin_spawn_egg` to `zombie_pigman_spawn_egg`, and `oak_button`/`oak_door`/`oak_trapdoor`/`oak_fence_gate`/`oak_pressure_plate` to the unprefixed Bedrock legacy names.

### Data components

`item_data_components.json` (1.3 MB) carries Mojang's default component set for all 1658 items, with each component value base64-encoded in its Java network form. 69 distinct component types appear as defaults. Thirteen are on every item (`attack_animation`, `attribute_modifiers`, `break_sound`, `enchantments`, `interact_animation`, `item_model`, `item_name`, `lore`, `max_stack_size`, `rarity`, `repair_cost`, `tooltip_display`, `use_effects`); the tail is sparse (`cooking_fuel` on 347, `compostable` on 122, `equippable` on 84, `tool` on 38, `glider` on 1).

Geyser's source references all 122 types in Mojang's `minecraft:data_component_type` registry; after normalizing Java's `cat/variant` naming to Geyser's `CAT_VARIANT`, there are zero unreferenced types and zero Geyser symbols without a Java counterpart.

Referencing is not translating. `ItemTranslator.translateToBedrock` does this:

```java
DataComponents components = javaItem.gatherComponents(session.getComponentCache(), customComponents);
TooltipOptions tooltip = TooltipOptions.fromComponents(components);
javaItem.translateComponentsToBedrock(session, components, tooltip, nbtBuilder);
```

The per-item subclasses under `item/type/` (29 of them: `ArmorItem`, `BannerItem`, `CompassItem`, `CrossbowItem`, `DecoratedPotItem`, `GoatHornItem`, `PlayerHeadItem`, `PotionItem`, `ShieldItem`, `TropicalFishBucketItem`, `WrittenBookItem` and so on) write Bedrock NBT.

### What is lossy

Everything Bedrock has no slot for becomes display text:

- `unbreakable` becomes a blue lore line rendering `item.unbreakable`.
- `attribute_modifiers` on a custom item become lore lines via `addAttributeLore`.
- A Java enchantment with no Bedrock equivalent becomes a lore line plus a forced glint. `Item.remapEnchantment` is explicit:

  ```java
  BedrockEnchantment bedrockEnchantment = enchantment.get().bedrockEnchantment();
  if (bedrockEnchantment == null) {
      String enchantmentTranslation = MessageTranslator.convertMessageForTooltip(enchantment.get().description(), session.locale());
      addJavaOnlyEnchantment(session, builder, enchantmentTranslation, level);
      builder.addEnchantmentGlint();
      return null;
  }
  ```

  Java 26.3 ships 43 enchantment files; `BedrockEnchantment` has 42 constants; `sweeping_edge` is the only vanilla Java enchantment with no Bedrock id. Every datapack enchantment hits the same path. The Bedrock client sees a name and a shine, and no behavior. This is Geyser's "Custom enchantments/sweeping edge" limitation ([#3121](https://github.com/GeyserMC/Geyser/issues/3121)).
- `enchantment_glint_override` is one-directional, with the code comment "Add enchantment override. We can't remove it - enchantments would stop showing - but we can add it."
- Enchantment levels above the vanilla maximum are not rendered: "Showing non-vanilla enchantment levels, such as \"Silk Touch 2\"" ([#5252](https://github.com/GeyserMC/Geyser/issues/5252)).
- `potion_contents` colors are listed as unfixable ("Potion colors implemented using the PotionContents data component"), and Geyser appends the effect names to the item's custom name instead, with a `TODO should this be done with lore instead?` in the source.
- `can_break` and `can_place_on` survive as Bedrock's `canBreak` and `canPlace` string lists, but only where the Java block state maps to a distinguishable Bedrock identifier.

### The creative menu is Bedrock's

`CreativeContentPacket` is built from `bedrock/creative_items.26_50.json`, 1980 items in 124 groups, captured from the Bedrock client. `CreativeItemRegistryPopulator` strips items that do not exist on the Java version in use, with a TODO noting that doing this properly "has the nasty side-effect of breaking creative categories". Java's own creative tab definitions are never consulted.

## 4. Entity mapping

### Types

| Side | Count | Source |
|---|---|---|
| Java entity types | 161 | `reports/registries.json`, `minecraft:entity_type` |
| Bedrock entity identifiers | 136 | `bedrock/entity_identifiers.dat` |
| Exact name matches | 112 | set intersection |
| Geyser `VanillaEntityType` constants | 160 | `VanillaEntities.java` |

The two Java types with no Geyser constant are `block_display` and `item_display`. That matches open issue [#3810](https://github.com/GeyserMC/Geyser/issues/3810) "item/block display entities", labeled `Missing Client Feature`. The one Geyser constant that is not a Java registry entry is `ender_dragon_part`.

Of the 49 Java types with no identically named Bedrock entity, 22 are boats and chest boats that collapse onto Bedrock's `boat` and `chest_boat` with a variant field, 13 are plain renames applied in `VanillaEntities.java`:

```
end_crystal -> ender_crystal        experience_orb  -> xp_orb
evoker_fangs -> evocation_fang      eye_of_ender    -> eye_of_ender_signal
firework_rocket -> fireworks_rocket fishing_bobber  -> fishing_hook
experience_bottle -> xp_bottle      trident         -> thrown_trident
zombie_villager -> zombie_villager_v2  zombified_piglin -> zombie_pigman
tropical_fish -> tropicalfish       villager        -> villager_v2
breeze_wind_charge -> breeze_wind_charge_projectile, wind_charge -> wind_charge_projectile
```

and 14 are genuine gaps. Geyser handles ten of them by borrowing another Bedrock entity:

| Java entity | Shown to Bedrock as |
|---|---|
| `text_display` | `armor_stand` |
| `interaction` | `armor_stand` |
| `lingering_potion` | `splash_potion` |
| `spectral_arrow` | `arrow` (texture restored by the bundled pack) |
| `furnace_minecart` | `minecart`, marked `// Not present on Bedrock` |
| `spawner_minecart` | `minecart`, marked `// Not present on Bedrock` |
| `giant` | `zombie` |
| `evoker` | `evocation_illager` |
| `illusioner` | `evocation_illager`, marked `// Not present on Bedrock` (the pack supplies a texture) |
| `trader_llama` | `llama` |

`item_frame` and `glow_item_frame` are blocks on Bedrock, handled through `ItemFrameEntity` and the session's `itemFrameCache`. `marker` carries the comment "Is only ever sent over the network within (non-vanilla) entity type tags". `block_display` and `item_display` are simply absent.

### Metadata

`VanillaEntities.java` registers 230 `addTranslator(...)` calls, mapping Java data-tracker fields onto Bedrock entity data. 61 of them are `addTranslator(null)`, an explicit decision to drop the field. The display entity base drops 13 fields in a row:

```java
EntityTypeBase<DisplayBaseEntity> displayBase = EntityTypeBase.baseInherited(DisplayBaseEntity.class, entityBase)
        .addTranslator(null) // Interpolation delay
        .addTranslator(null) // Transformation interpolation duration
        .addTranslator(null) // Position/Rotation interpolation duration
        .addTranslator(MetadataTypes.VECTOR3, DisplayBaseEntity::setTranslation) // Translation
        .addTranslator(null) // Scale
        .addTranslator(null) // Left rotation
        .addTranslator(null) // Right rotation
        .addTranslator(null) // Billboard render constraints
        .addTranslator(null) // Brightness override
        .addTranslator(null) // View range
        .addTranslator(null) // Shadow radius
        .addTranslator(null) // Shadow strength
        ...
```

`TEXT_DISPLAY` then drops line width, background color, text opacity and the bit mask, keeping only the text. 34 Java metadata types are consumed (`MetadataTypes.*`), 90 Bedrock entity data keys and 97 Bedrock entity flags are written. Geyser's README still lists "Some Entity Flags" under "What's Left to be Added/Fixed".

### Attributes

Java 26.3 has 40 attributes (`reports/registries.json`, `minecraft:attribute`). `entity/attribute/GeyserAttributeType.java` is 100 lines and divides into three groups:

| Group | Count | Members |
|---|---|---|
| Both editions | 10 | `follow_range`, `knockback_resistance`, `movement_speed`, `flying_speed`, `attack_damage`, `jump_strength`, `luck`, `friction_modifier`, `bounciness`, `air_drag_modifier` |
| Java only, Bedrock id `null`, never sent | 10 | `armor`, `armor_toughness`, `attack_knockback`, `attack_speed`, `max_health`, `scale`, `block_interaction_range`, `mining_efficiency`, `block_break_speed`, `submerged_mining_speed` |
| Bedrock only, synthesized by Geyser | 7 | `absorption`, `player.exhaustion`, `player.experience`, `player.level`, `health`, `player.hunger`, `player.saturation` |

The remaining 20 Java attributes do not appear in Geyser at all: `below_name_distance`, `burning_time`, `camera_distance`, `entity_interaction_range`, `explosion_knockback_resistance`, `fall_damage_multiplier`, `gravity`, `max_absorption`, `movement_efficiency`, `name_tag_distance`, `oxygen_bonus`, `safe_fall_distance`, `sneaking_speed`, `spawn_reinforcements`, `step_height`, `sweeping_damage_ratio`, `tempt_range`, `water_movement_efficiency`, `waypoint_receive_range`, `waypoint_transmit_range`.

Two of those have open or closed issues confirming the consequence: [#4854](https://github.com/GeyserMC/Geyser/issues/4854) "GENERIC_STEP_HEIGHT attribute is not handled correctly for players" (open, `Missing Client Feature`) and [#4864](https://github.com/GeyserMC/Geyser/issues/4864) "PLAYER_BLOCK_INTERACTION_RANGE Attribute does not apply to Bedrock Edition Player" (closed, `Can't Fix`).

The file carries the structural reason in one line: "Minimum, maximum, and default values are hardcoded on Java Edition, whereas controlled by the server on Bedrock."

## 5. Inventory and container translation

### Coverage

All 25 Java menus in `reports/registries.json`'s `minecraft:menu` have a translator registered in `InventoryTranslator.INVENTORY_TRANSLATORS`. The package holds 34 files, including three chest translators, four furnace translators and five mount translators.

### Server-authoritative inventories

`StartGamePacket` sets `setInventoriesServerAuthoritative(true)`. Bedrock then sends `ItemStackRequest` packets carrying typed actions (`TransferItemStackRequestAction`, `SwapAction`, `DropAction`, `ConsumeAction`, `AutoCraftRecipeAction`, `CraftResultsDeprecatedAction`), and Geyser converts each into a sequence of Java clicks through `inventory/click/ClickPlan.java`, replying with an `ItemStackResponse`.

This is the cleanest part of the translation, and it is also where Bedrock loses information that cannot be recovered. Geyser's limitations page lists "Distinguishing between left and right clicks in inventories" as unfixable; the Bedrock protocol carries the resulting slot transfer, not the mouse button. Issue [#5256](https://github.com/GeyserMC/Geyser/issues/5256) "InventoryClickEvent doesn't work for 2x2 crafting grid when slots are empty" is closed `Can't Fix` for the same reason.

### The fake block

Bedrock opens a container only against a block in the world. Java opens containers from nothing. `inventory/holder/BlockInventoryHolder.java` bridges the gap, self-described as "Manages the fake block we implement for each inventory, should we need to. This class will attempt to use a real block first, if possible."

`prepareInventory` first checks whether the player just clicked a block valid for this container type and has not moved. Failing that, it calls `InventoryUtils.findAvailableWorldSpace(session)`, sends an `UpdateBlockPacket` placing a Bedrock block of the right type at that position with `FLAG_ALL_PRIORITY`, optionally sets a custom name, and opens the container there. The class also documents why Geyser deliberately avoids reusing real blocks:

```java
// While we could reuse real blocks for virtual inventories,
// it can result in unpleasant visual artifacts with specific plugins.
// Specifically - a few plugins send multiple ClientboundOpenScreen packets
// with different titles; where Geyser needs to re-open the menu fully in order to get
// the correct title to appear. The additional delay added by using virtual blocks masks
// the quick closing of the first packet.
```

A server that owns the world can place the fake block in its own state without racing a remote Java server, which removes most of this class's complexity but not the need for it.

### Crafting grid and creative menu

The Bedrock player inventory has a 2x2 crafting grid that Java's player screen does not have in creative mode. Geyser hides it with a resource pack rather than in the protocol; the GeyserIntegratedPack's documented contents include "Inventory UI changes to match Java", and the older wiki revision names it directly: "Crafting in the 2x2 menu while in creative mode - with the GeyserOptionalPack, this grid is hidden as it does not exist on Java" (`https://raw.githubusercontent.com/GeyserMC/GeyserWiki/master/_docs/geyser/current-limitations.md`, historical).

The offhand slot has no Bedrock UI at all. The FAQ (`https://geysermc.org/wiki/geyser/faq/`) answers "How can Bedrock players hold items in their offhand?" with "You can use the command `/geyser offhand`, which will swap the item in their main hand and offhand. There is also a setting you can enable in the config (`emote-offhand-workaround`)".

## 6. Recipes, particles, sounds, effects, scoreboards, boss bars, text, registry sync

### Recipes

`JavaUpdateRecipesTranslator` opens with "Used to send all valid recipes from Java to Bedrock. Bedrock REQUIRES a CraftingDataPacket to be sent in order to craft anything." Java 26.3 has 8 recipe types and 22 serializers; Bedrock accepts shaped data, shapeless data, smithing transform data and potion mix data, plus a hardcoded `CARTOGRAPHY_RECIPES` list Geyser maintains itself.

Two comments in `JavaRecipeBookAddTranslator` describe the client's fragility:

```java
// Hacky fix: on 26.20 and above, the client crashes when there are no furnace recipes. Furnace recipes also have to be shapeless.
// Before this fix, Geyser did not translate furnace recipes at all.
```

```java
// Sending an empty list here will crash the client as of 1.20.60
```

Recipe kinds Bedrock cannot express at all appear on the limitations page: custom anvil recipes, custom smithing table ingredients and patterns ([#4706](https://github.com/GeyserMC/Geyser/issues/4706)), and custom furnace cook times ([#4104](https://github.com/GeyserMC/Geyser/issues/4104)). Custom brewing stand recipes are open issue [#4393](https://github.com/GeyserMC/Geyser/issues/4393), labeled `Can't Fix`.

### Particles

`particles.json` has 128 entries, exactly Java 26.3's 128 particle types. 90 carry a `bedrockId` (a Bedrock particle name), 80 carry an `eventType` (a Bedrock LevelEvent), and 38 have only the event route. Four Java particle types have neither: `BLOCK_MARKER`, `GEYSER`, `NOXIOUS_GAS_CLOUD`, `TRAIL`. The limitations page notes that "Hit particles and other miscellaneous particles not natively in Bedrock" come from the bundled resource pack.

### Sounds

`sounds.json` has 1991 entries, exactly Java 26.3's 1991 sound events. 1046 map to a Bedrock `LevelSoundEvent` enum value; 1916 carry a `playsound_mapping` string; 945 reach the client only as a playsound string with no enum; 11 have neither mapping and are dropped. 31 are routed as Bedrock level events, 177 carry an extra `identifier`, 16 carry `extra_data`, 13 carry a `pitch_adjust` correction.

A known breakage: `/stopsound` with a category is open issue [#3335](https://github.com/GeyserMC/Geyser/issues/3335), "Stopsound stops all sounds on bedrock regardless of chosen category", labeled `Can't Fix`.

### Effects and level events

`effects.json` has 41 entries across five types: 19 `soundEvent`, 14 `soundLevel`, 4 `playSound`, 1 `record`, 3 with an empty type. Java has 40 mob effects. Geyser's limitations page calls out "Dolphin's Grace potion effect visuals (effects should still work correctly)" and "Glowing effect" as unfixable.

### Biomes

`biomes.json` has 67 entries, exactly the 67 biome files in Java 26.3's datapack. Every Java biome has a Bedrock id, but two ids are shared: id 7 serves both `river` and `the_void`, and id 9 serves `the_end`, `end_barrens`, `end_highlands`, `end_midlands` and `small_end_islands`.

A biome with no mapping, which is what any datapack biome is, falls back by dimension (`translator/level/BiomeTranslator.java`):

```java
/**
 * Resolves a Java biome network ID to a Bedrock biome ID, never returning an invalid ID.
 * Biomes that could not be mapped, along with out-of-range network IDs, resolve to a
 * vanilla biome fitting the session's current dimension so that sky, fog and weather
 * render sensibly instead of always defaulting to ocean.
 */
```

The fallbacks are `minecraft:nether_wastes` for nether-like dimensions, `minecraft:the_end` for the End, and `minecraft:ocean` otherwise.

### Scoreboards, boss bars, text

Scoreboards get 5 translators under `translator/protocol/java/scoreboard/` plus a `scoreboard/` package with `Objective`, `Scoreboard`, `ScoreboardUpdater`, `ScoreReference`, `Team` and display handling, with a rate limiter "for example by limiting the amount of sidebar scores to the amount of lines that can be shown". Bedrock's narrower scoreboard character limit is worked around by the resource pack ("Scoreboard width that matches Java").

Boss bars are a close fit: `session/cache/BossBar.java` is 149 lines and passes Java's color and overlay straight through to `BossEventPacket`.

Text is the sharpest downgrade. `translator/text/MessageTranslator.java` flattens Java's component tree into Bedrock's legacy `§` string using an Adventure `LegacyComponentSerializer` with a nesting limit of 30. Two formats are deleted outright:

```java
// The following two do not yet exist on Bedrock - https://bugs.mojang.com/browse/MCPE-41729
formats.remove(CharacterAndFormat.STRIKETHROUGH);
formats.remove(CharacterAndFormat.UNDERLINED);
```

Twelve Bedrock-only material color codes are added (`g` Minecoin Gold, `h` Quartz, `i` Iron, `j` Netherite, `m` Redstone, `n` Copper, `p` Gold, `q` Emerald, `s` Diamond, `t` Lapis, `u` Amethyst, `v` Resin). Click events are gone: "Clickable links in chat" heads the unfixable list, and "Support RGB colors" ([#4404](https://github.com/GeyserMC/Geyser/issues/4404)) is closed `Can't Fix`. Chat signing must be disabled server-side: "Bedrock Edition does not support this reporting mechanism. If your server or proxy settings require that every player joining supports this mechanism ... Bedrock players will be unable to chat" (`https://geysermc.org/wiki/geyser/secure-chat/`).

### Registry sync versus StartGame

Geyser reimplements Java's configuration phase in `session/cache/registry/RegistryCache.java`. It buffers every `ClientboundRegistryDataPacket`, freezes all registries at `FinishConfiguration`, then parses and binds them so cross-registry references resolve. Entries whose data is null fall back to the network codec bundled in MCProtocolLib ("If the data is null, that's the server telling us we need to use our default values"). `JavaRegistryReaders` registers 27 readers, covering chat types, dimension types, biomes, enchantments, banner patterns, instruments, jukebox songs, painting variants, trim materials and patterns, damage types, dialogs, world clocks, decorated pot patterns, block transformers, and 12 entity variant and sound-variant registries. Anything without a reader is logged and discarded: "Ignoring registry of type ...".

Bedrock has no equivalent. Everything the client needs is fixed data Geyser captured from the Bedrock client and replays at login (`GeyserSession.sendRegistryDefinitions`):

```java
BiomeDefinitionListPacket biomeDefinitionListPacket = new BiomeDefinitionListPacket();
biomeDefinitionListPacket.setBiomes(Registries.BIOMES.get());
...
AvailableEntityIdentifiersPacket entityPacket = new AvailableEntityIdentifiersPacket();
entityPacket.setIdentifiers(Registries.BEDROCK_ENTITY_IDENTIFIERS.get());
...
CreativeContentPacket creativePacket = new CreativeContentPacket();
```

`Registries.BIOMES` loads `bedrock/stripped_biome_definitions.json`, 88 Bedrock biomes with temperature, downfall, ash densities, depth, scale, map water color and tags. `Registries.BEDROCK_ENTITY_IDENTIFIERS` loads `bedrock/entity_identifiers.dat`, 136 identifiers. Neither is derived from the Java server. This is the structural asymmetry: Java's registries are server-defined and streamed, Bedrock's are client-defined and fixed.

`StartGamePacket` carries the rest. Notable settings in `GeyserSession.buildStartGamePacket`:

- `setSeed(-1L)`. The Bedrock client never learns the world seed.
- `setDimensionId(bedrockDimension.bedrockId())`, one of three values. `BedrockDimension` hardcodes `OVERWORLD = new BedrockDimension(-64, 384, ...)`, `THE_END = new BedrockDimension(0, 256, ...)` and a nether whose id flips to the End's when the Java server builds above the nether roof.
- Three Bedrock experiments enabled unconditionally so custom content works at all: `data_driven_items` ("Holiday Creator Features ... needed for blocks and items"), `upcoming_creator_features` ("Needed for block properties for states"), `experimental_molang_features` ("Needed for certain molang queries used in blocks and items").
- `setServerAuthoritativeBlockBreaking(true)` with the comment that says what it does and does not buy:

  ```java
  // Server authorative block breaking results in the client always sending
  // positions for block breaking actions, which is easier to validate
  // It does *not* mean we can dictate the break speed server-sided :(
  ```

  That is the mechanism behind open issue [#3987](https://github.com/GeyserMC/Geyser/issues/3987) "Unfair Advantage in Mining Speeds between Bedrock & Java" (`Can't Fix`) and closed [#5094](https://github.com/GeyserMC/Geyser/issues/5094) "Obsidian & Crying Obsidian block breaking times are different".

### Game rules

Java 26.3 has 59 game rules (`reports/registries.json`, `minecraft:game_rule`). Geyser sets 8 Bedrock rules in total (`GameRuleData<>` and `sendGameRule` call sites): `naturalregeneration`, `keepinventory`, `spawnradius`, `recipesunlock`, `locatorBar`, `doimmediaterespawn`, `dodaylightcycle`, `showcoordinates`. None of them mirror Java's rule values; they neutralize client-side behavior so the server can own it. The source says so:

```java
// Only allow the server to send health information
// Setting this to false allows natural regeneration to work false but doesn't break it being true
gamerulePacket.getGameRules().add(new GameRuleData<>("naturalregeneration", false));
// Don't let the client modify the inventory on death
gamerulePacket.getGameRules().add(new GameRuleData<>("keepinventory", true));
// Ensure client doesn't try and do anything funky; the server handles this for us
gamerulePacket.getGameRules().add(new GameRuleData<>("spawnradius", 0));
```

The other 51 Java game rules are enforced entirely server-side and are invisible to the client, which is the correct outcome for most of them.

## 7. What Geyser explicitly cannot translate

### The published list

`https://geysermc.org/wiki/geyser/current-limitations/`, source at `https://raw.githubusercontent.com/GeyserMC/GeyserWebsite/master/wiki/geyser/current-limitations.md`, has three sections with 24, 8 and 1 bullets. Its framing:

> With Geyser being a protocol translator between two different games with two different codebases, there are a handful of limitations that Geyser is unfortunately unable to handle. Despite Minecraft Bedrock and Java being quite close in comparison, there are some vast differences in many areas.

> The following things cannot be fixed without changes to Bedrock or the Java protocol in general. As of now, they are not fixable in Geyser.

All 24 unfixable items, grouped:

Chat and UI (6): clickable links in chat; distinguishing between left and right clicks in inventories; "Various command arguments for any command that doesn't use the Minecraft Brigadier library"; "Anything that relies on tab complete or typing in the chat UI (related to the above) - Bedrock sends no packet that indicates they are in this menu"; "Maximum sign length different on Java/Bedrock edition"; "Second line on advancement toasts".

Rendering (7): glowing effect; redstone dot blockstates; "Potion colors implemented using the PotionContents data component"; "Unable to see banner layers past 6"; Dolphin's Grace visuals; "Invisible item frames - however, there are Bedrock edition resource packs making *all* item frames invisible"; "Blocks (excluding jack-o-lantern) on entity heads (E.G. armor stands, players)".

World and blocks (5): "Heights lower than -512 or higher than 512 in the overworld (and custom dimensions mapped by Geyser to the overworld), and heights lower than 0 or higher than 256 in other dimensions"; "Some block state changes are controlled client side, and are not influenced by the debug stick - fences for example"; "Custom beacon base blocks ... these are hardcoded on Bedrock edition"; "Climbable blocks changed by datapacks"; "Test instance blocks are not available in Bedrock".

Items, recipes and movement (6): "Custom anvil recipes or custom smithing table ingredients/patterns"; "Custom enchantments/sweeping edge"; "Gliding without elytras/custom elytras"; "Custom furnace cook times"; "Showing non-vanilla enchantment levels, such as \"Silk Touch 2\""; "Movement issues around bamboo due to offset differences between Java and Bedrock."

Eight more are listed as fixed only by the bundled Bedrock resource pack, which means Bedrock cannot do them natively: custom armor stand poses, illusioners, hit particles and other missing particles, offhand animations, shulker invisibility, the spectral arrow texture, Java-matching scoreboard width, and inventory UI changes.

The README adds "Near-perfect movement (to the point where anticheat on large servers is unlikely to ban you)" and "Some Entity Flags" to the outstanding list, and the anticheat page names GodsEye, NoCheatPlus and Wraith as "Incompatible (False Positives on Bedrock Players, no Compatibility at All)" (`https://geysermc.org/wiki/geyser/anticheat-compatibility/`).

### Labels and counts

`https://api.github.com/repos/GeyserMC/Geyser/labels?per_page=100` returns 39 labels. There is no `bedrock limitation` or `blocked by bedrock` label. The relevant ones, with their verbatim API descriptions:

| Label | Description | Open issues | All issues |
|---|---|---|---|
| `Can't Fix` | "When (as of the information we know) it is impossible to fix" | 7 | 77 |
| `Missing Client Feature` | "When the Bedrock client is missing a feature that Java Edition has" | 10 | 46 |
| `Client Bug` | (none) | 7 | 52 |
| `Won't Fix` | (none) | 0 | 19 |
| `Upstream` | "Something that needs to be resolved or addressed upstream." | 1 | |
| `Waiting For Minecraft Update` | "When a PR or issue likely won't be resolved before the next Minecraft update." | 1 | |
| `Missing Implementation` | "This has yet to be implemented." | | 33 |

Geyser closes `Can't Fix` issues, so the 77 closed ones are the useful corpus, not the 7 open ones. Every issue cited from the limitations page is closed and carries `Can't Fix`.

Concrete open examples beyond those already named: [#5655](https://github.com/GeyserMC/Geyser/issues/5655) falling block velocity, [#4881](https://github.com/GeyserMC/Geyser/issues/4881) custom arrow textures, [#1852](https://github.com/GeyserMC/Geyser/issues/1852) hide-enchants attribute, [#4992](https://github.com/GeyserMC/Geyser/issues/4992) redstone dust direction, [#4985](https://github.com/GeyserMC/Geyser/issues/4985) piston heads, [#3645](https://github.com/GeyserMC/Geyser/issues/3645) custom grass and leaf colors, [#5547](https://github.com/GeyserMC/Geyser/issues/5547) fishing rods with custom model data, [#6666](https://github.com/GeyserMC/Geyser/issues/6666) debug-stick stairs, [#1916](https://github.com/GeyserMC/Geyser/issues/1916) infinite elytra ascent in creative, [#750](https://github.com/GeyserMC/Geyser/issues/750) splitscreen.

Closed `Can't Fix` examples that name a Bedrock client limit directly: [#6237](https://github.com/GeyserMC/Geyser/issues/6237) "Bedrock Edition does not support the functionality of the PC version which includes the Glider component", [#5925](https://github.com/GeyserMC/Geyser/issues/5925) holograms drifting when approached, [#5657](https://github.com/GeyserMC/Geyser/issues/5657) player locator bar, [#5509](https://github.com/GeyserMC/Geyser/issues/5509) clickable components, [#5209](https://github.com/GeyserMC/Geyser/issues/5209) stacked custom player heads, [#4432](https://github.com/GeyserMC/Geyser/issues/4432) items on heads.

### Environment-level limits

From the FAQ (`https://geysermc.org/wiki/geyser/faq/`):

> currently, there is no way for Geyser to translate the features that most mods add (blocks, items, etc.). Therefore, servers that require mods to be installed clientside are unsupportable through Geyser.

> There is currently no automatic Java-to-Bedrock resource pack conversion

> This is a Bedrock client issue caused by Bedrock being 32-bit and Java being 64-bit.

From the packs page (`https://geysermc.org/wiki/geyser/packs/`):

> **Does Geyser support behavior packs/add-ons?** No. These would require modifications on the Java server side, which isn't possible when Geyser is used on a proxy.

> **On proxy setups: Are per-backend-server resource packs possible?** This unfortunately is not possible natively, as Bedrock edition only allows removing and adding packs when connecting initially to the server.

The last two are proxy constraints Geyser has and an integrated server does not.

## 8. Custom content

### The APIs

Geyser's public API carries 18 files under `api/.../block/` (including `CustomBlockData`, `CustomBlockState`, `CustomBlockPermutation`, `NonVanillaCustomBlockData`, plus `component/` and `property/`), 32 under `api/.../item/`, and 26 under `api/.../entity/` (including `custom/CustomEntityDefinition` and a five-type entity property system). The server side has `CustomBlockRegistryPopulator`, `CustomItemRegistryPopulator` and `CustomSkullRegistryPopulator`.

JSON mappings live in a `custom_mappings` folder and are gated behind `gameplay.enable-custom-content: true`, whose config comment reads:

> Whether to add any items and blocks which normally does not exist in Bedrock Edition. This should only need to be disabled if using a proxy that does not use the "transfer packet" style of server switching. If this is disabled, furnace minecart items will be mapped to hopper minecart items. Geyser's block, item, and skull mappings systems will also be disabled.

Item mappings use `format_version: 2` (v1 deprecated since Geyser API 2.9.3), block mappings `format_version: 1`. The custom entity API arrived in Geyser API 2.11.0 with the 26.2 update, is marked `@ApiStatus.Experimental`, and "currently cannot be used via JSON mappings" (`https://geysermc.org/wiki/geyser/custom-entities/`).

Three constraints in Geyser's own words shape what is possible:

> Unlike Java Edition, Bedrock Edition does not support modifying item properties dynamically at runtime (e.g. making dirt edible with a command).

> Bedrock does not support extending vanilla items or modifying vanilla item behavior.

> It should be noted that blocks and their associated components are not very stable. Mojang tends to make changes to these much more often than they do for items. This means that any components Geyser allows you to register are liable to break in future versions of Bedrock.

The first is the deep one. Java is dynamic at runtime because a data component on a stack can change anything; Bedrock items are statically declared at join time. Geyser's answer is predicates: register several pre-baked Bedrock items and select between them per stack.

### The resource pack is mandatory

> Further, a Bedrock edition resource pack must also be supplied to ensure Bedrock players can see custom items. ... Geyser does not generate or convert Java Edition resource packs into Bedrock Edition resource packs, so you will need to set it up manually! (`https://geysermc.org/wiki/geyser/custom-items/`)

> Additionally to registering custom entity definitions, you will also need to provide a resource pack to players defining custom entity textures and animations. (`https://geysermc.org/wiki/geyser/custom-entities/`)

Packs reach the client two ways (`https://geysermc.org/wiki/geyser/packs/`). Local `.zip` or `.mcpack` files in a `packs` folder are sent to everyone. Remote URLs work through the API under constraints Geyser calls out as the client's, not its own:

> The link must be a direct link to the resource pack download ... The Content-Length header must specify the exact file size. ... The Content-Type application header must be set to `application/zip`. ... It is unfortunately not possible to bypass these, as these are restrictions imposed by the Bedrock client.

### Two packs Geyser ships itself

`core/src/main/resources/bedrock/skull_resource_pack/` is checked into the repository: a manifest, four `.geo.json` models (floor, wall, hand, base), two animations, one attachable template and a `terrain_texture.json`. This is how Java player heads with custom skins render on Bedrock at all.

`GeyserIntegratedPack.mcpack` is not in the repository. `core/build.gradle.kts` downloads it at build time:

```kotlin
val source = "https://download.geysermc.org/v2/projects/geyserintegratedpack/versions/latest/builds/latest/downloads/geyserintegratedpack"
```

It is applied at low priority so server packs can override it, and it supplies the eight parity items listed in section 7 plus hiding Bedrock-only UI (the cartography table text field, the creative 2x2 grid, command block tick-delay and rename fields, non-Java structure block options). Its conflict rule matters for anyone shipping their own entity definitions: "The Bedrock client will prioritize the entity definition based on pack application order - highest wins!" (`https://geysermc.org/wiki/other/geyserintegratedpack/`).

## 9. Licensing

### Geyser

`https://github.com/GeyserMC/Geyser/blob/master/LICENSE`, 21 lines, MIT. The GitHub API reports `spdx_id: MIT`. The first three lines:

```
The MIT License

Copyright (c) 2019-2026 GeyserMC. http://geysermc.org
```

Every source file repeats it as a header, for example `core/src/main/java/org/geysermc/geyser/GeyserImpl.java`:

```java
/*
 * Copyright (c) 2019-2022 GeyserMC. http://geysermc.org
 *
 * Permission is hereby granted, free of charge, to any person obtaining a copy
 * of this software and associated documentation files (the "Software"), to deal
 * in the Software without restriction, including without limitation the rights
 * to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
 * copies of the Software, and to permit persons to whom the Software is
 * furnished to do so, subject to the following conditions:
 *
 * The above copyright notice and this permission notice shall be included in
 * all copies or substantial portions of the Software.
 *
 * THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
 * IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
 * FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
 * AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
 * LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
 * OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN
 * THE SOFTWARE.
 *
 * @author GeyserMC
 * @link https://github.com/GeyserMC/Geyser
 */
```

### The mappings data

`https://github.com/GeyserMC/mappings/blob/master/LICENSE` is the same MIT text with the same `Copyright (c) 2019-2026 GeyserMC. http://geysermc.org` line. The README adds the scope limit verbatim:

> These files are licensed by GeyserMC under the MIT license. Please note that GeyserMC only licenses the original work contributors have the right to license. GeyserMC does not relicense Minecraft, its data, or any other material owned by Mojang or Microsoft.

`GeyserMC/mappings-generator` is MIT with the same footnote:

> [^1]: Please note that we only license the original work contributors have the right to license. We do not relicense Minecraft, its data, or any other material owned by Mojang or Microsoft.

### Can an MPL-2.0 project depend on or vendor them?

This repository's root `package.json` declares `"license": "MPL-2.0"` and `LICENSE` is Mozilla Public License Version 2.0. The workspace packages are already mixed: 14 MIT, 1 ISC, 1 MPL-2.0.

Yes, in both modes, subject to one obligation each:

- Depending on them at runtime or build time. MIT places no restriction on the license of the depending work. Nothing in MPL-2.0 restricts what a Covered Work may depend on. MPL section 3.3 covers the combination: "You may create and distribute a Larger Work under terms of Your choice, provided that You also comply with the requirements of this License for the Covered Software."
- Vendoring the files. MIT requires that "The above copyright notice and this permission notice shall be included in all copies or substantial portions of the Software." So vendored files keep their MIT header and the MIT license text travels with them. They do not become MPL-covered. MPL section 3.4 separately forbids removing license notices from Covered Software, which points the same way.

Two cautions that are not license questions. First, GeyserMC's own disclaimer says the mapping data derives from Mojang material it cannot relicense; the Bedrock palette in particular is captured from the Bedrock client. The same analysis in [bedrock-data-extraction.md](bedrock-data-extraction.md) applies. Second, `blocks.nbt` is positional over Java 26.3's state ordering, so vendoring it also vendors a version pin.

For contrast, the adjacent ecosystem is split: `CloudburstMC/Protocol` (the Bedrock codec Geyser uses) is Apache-2.0 with `Copyright 2020 NukkitX`; `CloudburstMC/ProxyPass` is AGPL-3.0; `CloudburstMC/Cloudburst` declares no license at all; ViaBedrock, ViaVersion and ViaProxy are GPL-3.0; PocketMine-MP and PowerNukkitX are LGPL-3.0; PrismarineJS `minecraft-data` and `bedrock-protocol` are MIT.

## 10. Other projects in this space

| Project | Direction | License | State |
|---|---|---|---|
| GeyserMC/Geyser | Java server to Bedrock client | MIT | 5928 stars, 5079 commits, daily activity. The only working implementation. |
| DragonetMC/DragonProxy | same | GPL-3.0 | Archived 2021-04-07, froze at Bedrock 1.5.3 / Java 1.12.2. Geyser's README credits it as the predecessor. |
| ViaVersionAddons/ViaBedrock | Java *client* to Bedrock server | GPL-3.0 | `0.0.31-SNAPSHOT` after four years. README: "ViaBedrock is in very early stages of development and NOT intended for regular use yet." Unchecked features: "Client-Authoritative Inventory", "Server-Authoritative Inventory", "Block breaking". One Java version and one Bedrock version at a time (`JAVA_VERSION = ProtocolVersion.v26_3`, `BEDROCK_PROTOCOL_VERSION = 2193`). |
| ViaProxy | both | GPL-3.0 | Does not reimplement the Geyser direction. Its README lists Bedrock clients as "Requires the [Geyser plugin]". |
| GeyserMC/Hydraulic | modded Java server to Bedrock client, alongside Geyser | MIT | 317 stars, "still in very early development and should not be used on production setups!" (There is no project called Hydrofoil; GitHub search for `hydrofoil+minecraft` returns 0 results.) |
| GeyserMC/Hurricane | Java-server-side movement fixes for Bedrock players | | 72 stars; the one limitation Geyser routes to a server mod. |
| PowerNukkitX, Cloudburst, PocketMine-MP | Bedrock servers | LGPL-3.0 / none / LGPL-3.0 | None hold Java-shaped state. Cloudburst's `anvil` importer reads the Anvil *container* format that old Nukkit reused, holding Bedrock numeric ids, and upgrades them through `BlockStateUpdaters`; Java block semantics never enter. PocketMine-MP and `pmmp/BedrockProtocol` are both archived as of 2026-07. |
| CloudburstMC/Protocol | Bedrock packet codec | Apache-2.0 | 65 version codec packages v291 through v2225 in the tree (its README table is stale at v567). Geyser depends on it. |
| PrismarineJS/minecraft-data | bidirectional block state mapping data | MIT | Ships `blocksB2J.json` (11585 entries) and `blocksJ2B.json` (32366 entries) at `data/bedrock/1.26.30/`, a flat string-to-string map of canonical state strings. Independent confirmation of the same many-to-one collapse: both `grass_block[snowy=true]` and `grass_block[snowy=false]` map to `minecraft:grass_block[]`. |
| PrismarineJS/bedrock-protocol | Bedrock protocol in JS | MIT | 54 Bedrock versions, 1.16.201 through 1.26.51. Protocol only, no Java semantics. |

What this proves, taken together: the packet layer is solved in at least three languages, the semantic layer is solved exactly once, and the reverse semantic layer is not solved at all after four years of effort by a competent maintainer. The hard part is not the wire format.

The Minecraft Wiki's "Parity issue list" (`https://minecraft.wiki/w/Parity_issue_list`, non-primary, and carrying its own cleanup banner asking editors to re-verify unsourced entries) lists 664 Java-only items, 982 Bedrock-only items and 124 unsorted, 1773 in total. Blocks and entities are 60 percent of the Java-only side and 64 percent of the Bedrock-only side. The Bedrock-exclusive side being larger cuts against the intuition that Bedrock is a subset of Java. The wiki title that reads "Java Edition / Bedrock Edition differences" returns 404; "Parity issue list" is the live page.

## 11. Assessment

### What fraction of Java parity a Bedrock client can actually observe

Measured per domain, against Java 26.3 and Bedrock 1.26.50:

| Domain | Observable | Basis |
|---|---|---|
| Block identity | 1281 of 1286 blocks (99.6%) | only `test_block` and `test_instance_block` have no Bedrock concept |
| Block state detail | about 2221 of 2313 (block, property) pairs (96%) | 671 collapse, 504 return via the second layer, 75 of the remaining 167 return via block entity NBT or client-side recomputation |
| Block collision and shape | full | Geyser carries Java's 338 collision and 873 occlusion shapes per state and runs them server-side |
| Item identity | 1654 of 1658 (99.8%) | `spectral_arrow`, `debug_stick`, `knowledge_book`, `furnace_minecart` lose identity without the custom item system |
| Item components as mechanics | partial | all 122 types parsed; those with no Bedrock slot become lore text |
| Enchantments | 42 of 43 vanilla; 0 of any datapack enchantment as mechanics | `BedrockEnchantment` has 42 constants; everything else is lore plus glint |
| Entity types | 159 of 161 present, 149 with their own Bedrock entity (93%) | `block_display` and `item_display` absent; 10 borrow another entity |
| Entity metadata | 169 of 230 translated, 61 explicitly dropped (73%) | `addTranslator(null)` count |
| Entity attributes | 10 of 40 sendable (25%) | `GeyserAttributeType` |
| Containers | 25 of 25 Java menus | `InventoryTranslator` |
| Particles | 124 of 128 reach the client in some form (97%) | 4 have no route |
| Sounds | 1980 of 1991 (99.4%) | 11 have no mapping; 945 arrive only as a playsound string |
| Biomes | 67 of 67 vanilla, 0 of any datapack biome | `biomes.json`; unmapped biomes fall back by dimension |
| Game rules | 8 Bedrock rules set, none mirroring Java's 59 | the other 51 are enforced server-side and invisible, which is correct |
| Text formatting | colors and bold and italic yes; underline, strikethrough, click events, hex colors no | `MessageTranslator`, MCPE-41729, issue #4404 |
| Dimensions | 3 Bedrock ids for any number of Java dimension types | `BedrockDimension`, `JavaDimension.read` |

Weighted by what a player actually sees, call it the low nineties for world and item appearance, the seventies for entity expressiveness, and the twenties for anything attribute-driven.

### What is structurally unobservable no matter what the server does

These are not Geyser bugs. They are properties of the Bedrock client, and a JSPrismarine that holds Java-shaped state would hit every one of them identically.

1. Mining speed. The Bedrock client decides how long a block takes to break. `setServerAuthoritativeBlockBreaking(true)` makes the client report positions, not accept timings. Java's `mining_efficiency`, `block_break_speed` and `submerged_mining_speed` attributes have no Bedrock counterpart. Issues #3987 and #5094.
2. Beacon base blocks. Hardcoded in the Bedrock client. Issue #2301.
3. Climbable blocks. Hardcoded in the Bedrock client, so datapack changes to the `climbable` tag do nothing. Issue #4051.
4. Gliding conditions. The Bedrock client decides when gliding starts, keyed to its own elytra item. The Java `glider` data component has no Bedrock equivalent. Issues #3255, #3299, #6237.
5. Furnace cook times. The Bedrock client animates the progress bar at its own rate. Issue #4104.
6. Client-computed block connections. Fences, walls, panes, redstone dust, chorus plants and grass `snowy` are decided by the Bedrock client from its neighbors, so a server cannot make a fence connect where Bedrock says it should not. Issues #3125, #4992, #6666.
7. Left versus right click in inventories. Bedrock's `ItemStackRequest` carries the resulting transfer, not the button.
8. Typing state. Bedrock sends no packet when a player opens the chat input, so tab completion and anything keyed to typing cannot work.
9. Build height. Three fixed Bedrock dimension ids with fixed ranges. Below -512 or above 512 in the overworld, or outside 0 to 256 elsewhere, is unreachable. Issue #3804.
10. Registry shape. Bedrock's biome definitions, entity identifiers and creative menu are client data the server replays, not server data the client adopts. A Java-shaped server can add a biome or an entity type to its own registries and the Bedrock client will never learn about it without a resource pack and the three experimental toggles.
11. Runtime item mutation. Java changes an item's behavior by changing a component on the stack. Bedrock items are statically declared at join. Geyser's own documentation states this: "Unlike Java Edition, Bedrock Edition does not support modifying item properties dynamically at runtime".
12. Coordinate precision. Bedrock is 32-bit; visual corruption far from origin is a client property.
13. Text component semantics. Click events, hover events beyond text, underline, strikethrough and hex colors are all absent from Bedrock's legacy string format.

### What this means for a Java-semantics server

The translation is feasible. Geyser proves it in 170000 lines of Java, and most of that volume is not translation logic but the hand-maintained Java-side model that a datapack-driven server would get from data.

Three things follow for this repository:

- The mapping tables are the reusable asset, not the code. `GeyserMC/mappings` is MIT, 2.8 MB, and `blocks.nbt` joined to Mojang's `reports/blocks.json` gives a complete Java-state to Bedrock-state function in about 30 lines of script. `items.json`, `particles.json`, `sounds.json`, `biomes.json`, `effects.json`, `collisions.nbt` and `block_shapes.nbt` are the same shape. Three Bedrock palettes and an `entity_identifiers.dat` are needed alongside them, and Geyser bundles those too.
- The version coupling is per release, not per patch. Geyser tracks one Java version and four Bedrock codecs across 14 Bedrock versions, and its mappings repository takes about 14 commits a year. That is the maintenance floor.
- "1-1 Java parity" should be scoped to server-observable behavior, not client-observable behavior. Drops, redstone timing, mob AI, loot tables, advancement criteria, command semantics and world generation are all server-side and can be exactly Java's. Mining speed, fence connection rules, beacon bases, elytra gliding, furnace animation and inventory click semantics are client-side and will be Bedrock's forever. The plan should say which of the two it means.

## Open questions

- The 167 non-waterlogged dropped (block, property) pairs were bucketed by inspecting `translator/level/block/entity/` and by knowledge of Bedrock's client-side connection rules. The "roughly 78 recovered" figure is a hand classification, not a measured one. A packet capture against a real Bedrock client would settle each case.
- Geyser's `WildernessBoundConverter` remaps blocks for the 26.30 and 26.40 palettes. What it changes and why was not read. It is the mechanism by which one mapping file serves three Bedrock versions.
- `item_data_components.json` holds base64 Java network payloads. Decoding them requires MCProtocolLib's component codecs, which this note did not run, so the per-component default values were not inspected, only the type names and counts.
- Whether any of Java's 122 data component types are translated into real Bedrock item components (as opposed to NBT or lore) was not enumerated per component. `item_components.nbt` in the mappings repo carries per-Bedrock-item component overrides and most entries are empty compounds; what the non-empty ones carry was not read.
- The Bedrock entity identifier list was extracted by regex over `entity_identifiers.dat` because the file is not plain little-endian NBT. A proper decode might reveal per-entity flags (`hasSpawnEgg`, `summonable`) that matter for custom entities.
- Geyser's sound mapping has 945 entries that reach the client only as a playsound string. Whether a string playsound honors attenuation, category and pitch the same way a `LevelSoundEvent` does was not tested.
- No Bedrock client was run against anything during this research. Every claim about what a client renders comes from Geyser's code, Geyser's documentation, or Geyser's issue tracker.
- The licensing analysis is a reading of two license texts, not legal advice, and it does not address the separate question of whether redistributing Mojang-derived palette data is permitted at all.

## Reproduction

```
# Repositories (read only; cloned into their own empty directory)
mkdir -p /tmp/geyser-research
git clone --depth 1 https://github.com/GeyserMC/Geyser.git /tmp/geyser-research/geyser
git clone --depth 1 https://github.com/GeyserMC/mappings.git /tmp/geyser-research/mappings/repo
git -C /tmp/geyser-research/geyser log -1 --format='%H %cI %s'
git -C /tmp/geyser-research/mappings/repo log -1 --format='%H %cI %s'

# Geyser size and activity
find /tmp/geyser-research/geyser -name '*.java' | wc -l
find /tmp/geyser-research/geyser -name '*.java' | xargs wc -l | tail -1
git clone --filter=blob:none --no-checkout https://github.com/GeyserMC/Geyser.git /tmp/geyser-research/geyser-full
git -C /tmp/geyser-research/geyser-full rev-list --count HEAD
git -C /tmp/geyser-research/geyser-full rev-list --count --since=2025-10-24 HEAD
curl -sS https://api.github.com/repos/GeyserMC/Geyser

# Translator counts per domain
cd /tmp/geyser-research/geyser/core/src/main/java/org/geysermc/geyser
for d in translator/*/; do printf "%s %s\n" "$(find "$d" -name '*.java' | wc -l)" "$d"; done | sort -rn
find translator/protocol/java -name '*.java' | wc -l
find translator/protocol/bedrock -name '*.java' | wc -l
grep -rl '@Translator' translator/protocol | wc -l
grep -c 'register(new ' level/block/Blocks.java
grep -c 'IGNORED_PACKETS.add' registry/PacketTranslatorRegistry.java

# Java-side reference data (see java-datapacks.md for how this was produced)
python3 -I -c "import json;b=json.load(open('/tmp/bds-research-java/out/generated/reports/blocks.json'));print(len(b),sum(len(v['states']) for v in b.values()))"
python3 -I -c "import json;r=json.load(open('/tmp/bds-research-java/out/generated/reports/registries.json'));print({k:len(r[k]['entries']) for k in ['minecraft:entity_type','minecraft:attribute','minecraft:particle_type','minecraft:sound_event','minecraft:menu','minecraft:game_rule','minecraft:data_component_type']})"
python3 -I -c "import json;d=json.load(open('/tmp/bds-research-java/out/generated/reports/packets.json'));print(len(d['play']['clientbound']),len(d['configuration']['clientbound']))"
ls /tmp/bds-research-java/out/generated/data/minecraft/worldgen/biome/*.json | wc -l
ls /tmp/bds-research-java/out/generated/data/minecraft/enchantment/*.json | wc -l

# /tmp/geyser-tools/nbt.py is a ~50-line gzipped big-endian Java NBT reader written for this pass
# (kept outside the downloaded trees, and every python3 below runs with -I).
# entity_identifiers.dat is neither plain big- nor little-endian NBT, so it is read by regex instead.

# Block mapping shape and counts
python3 -I /tmp/geyser-tools/nbt.py /tmp/geyser-research/mappings/repo/blocks.nbt 2500
python3 -I -c "
import sys,json,collections; sys.path.insert(0,'/tmp/geyser-tools')
from nbt import load
_,v=load('/tmp/geyser-research/mappings/repo/blocks.nbt'); m=v['bedrock_mappings']
jb=json.load(open('/tmp/bds-research-java/out/generated/reports/blocks.json'))
idname={s['id']:n for n,d in jb.items() for s in d['states']}
tgt=collections.Counter()
for i,e in enumerate(m):
    short=idname[i].split(':',1)[1]
    tgt[('minecraft:'+e.get('bedrock_identifier',short), tuple(sorted(e.get('state',{}).items())))]+=1
print('java states',len(m),'distinct bedrock targets',len(tgt))
print('targets with >1 java state',sum(1 for c in tgt.values() if c>1))
"

# Bedrock palette, unreached states and Bedrock-only identifiers
python3 -I -c "
import sys,json,collections; sys.path.insert(0,'/tmp/geyser-tools')
from nbt import load
_,p=load('/tmp/geyser-research/geyser/core/src/main/resources/bedrock/block_palette.26_50.nbt')
bs=p['blocks']; print('bedrock states',len(bs),'identifiers',len({b['name'] for b in bs}))
"

# Dropped Java block properties (the 671 / 504 / 167 split)
python3 -I -c "
import sys,json,collections; sys.path.insert(0,'/tmp/geyser-tools')
from nbt import load
_,v=load('/tmp/geyser-research/mappings/repo/blocks.nbt'); m=v['bedrock_mappings']
jb=json.load(open('/tmp/bds-research-java/out/generated/reports/blocks.json'))
out=collections.defaultdict(list)
for name,d in jb.items():
    short=name.split(':',1)[1]
    ids=[s['id'] for s in d['states']]
    props={s['id']:s.get('properties',{}) for s in d['states']}
    tgt={i:('minecraft:'+m[i].get('bedrock_identifier',short), tuple(sorted(m[i].get('state',{}).items()))) for i in ids}
    for p in sorted({k for pp in props.values() for k in pp}):
        g=collections.defaultdict(set)
        for i in ids:
            g[tuple(sorted((k,x) for k,x in props[i].items() if k!=p))].add(tgt[i])
        if all(len(s)==1 for s in g.values()): out[p].append(short)
tot=sum(len(v) for v in out.values())
print('dropped pairs',tot,'waterlogged',len(out['waterlogged']),'rest',tot-len(out['waterlogged']))
for p in sorted(out,key=lambda x:-len(out[x])): print(' ',p,len(out[p]))
"

# Items
python3 -I -c "
import json,collections
d=json.load(open('/tmp/geyser-research/mappings/repo/items.json'))
print('items',len(d))
k=collections.Counter()
for v in d.values(): k.update(v)
print(k)
r=collections.Counter(v['bedrock_identifier'] for v in d.values())
print('distinct bedrock items',len(r),'shared',{a:b for a,b in r.items() if b>1})
"
python3 -I -c "
import json,collections
d=json.load(open('/tmp/geyser-research/mappings/repo/item_data_components.json'))
c=collections.Counter()
for e in d: c.update(e['components'])
print('entries',len(d),'distinct default component types',len(c))
"
grep -rho 'DataComponentTypes\.[A-Z_]*' /tmp/geyser-research/geyser/core/src/main/java | sed 's/.*\.//' | sort -u | wc -l

# Entities and attributes
grep -c 'public static final VanillaEntityType' /tmp/geyser-research/geyser/core/src/main/java/org/geysermc/geyser/entity/VanillaEntities.java
grep -c 'addTranslator(' /tmp/geyser-research/geyser/core/src/main/java/org/geysermc/geyser/entity/VanillaEntities.java
grep -c 'addTranslator(null)' /tmp/geyser-research/geyser/core/src/main/java/org/geysermc/geyser/entity/VanillaEntities.java
python3 -I -c "
import re
b=open('/tmp/geyser-research/geyser/core/src/main/resources/bedrock/entity_identifiers.dat','rb').read()
print('bedrock entity identifiers',len(set(re.findall(rb'minecraft:[a-z0-9_]+',b))))
"

# Particles, sounds, biomes, effects
python3 -I -c "
import json,collections
for f,k in [('particles.json',None),('sounds.json',None),('effects.json','type'),('biomes.json',None)]:
    d=json.load(open('/tmp/geyser-research/mappings/repo/'+f)); print(f,len(d))
p=json.load(open('/tmp/geyser-research/mappings/repo/particles.json'))
print('particles with a bedrockId',sum('bedrockId' in v for v in p.values()),'event only',sum('bedrockId' not in v for v in p.values()))
s=json.load(open('/tmp/geyser-research/mappings/repo/sounds.json'))
print('sounds with a LevelSoundEvent',sum(bool(v.get('bedrock_mapping')) for v in s.values()),'neither',sum(not v.get('bedrock_mapping') and not v.get('playsound_mapping') for v in s.values()))
"

# Geyser documentation and issue labels
curl -sSL https://raw.githubusercontent.com/GeyserMC/GeyserWebsite/master/wiki/geyser/current-limitations.md
curl -sS "https://api.github.com/repos/GeyserMC/Geyser/labels?per_page=100"
curl -sS "https://api.github.com/search/issues?q=repo%3AGeyserMC/Geyser+is%3Aissue+is%3Aopen+label%3A%22Can%27t+Fix%22"
curl -sS "https://api.github.com/search/issues?q=repo%3AGeyserMC/Geyser+is%3Aissue+label%3A%22Missing+Client+Feature%22"

# Licenses
curl -sSL https://raw.githubusercontent.com/GeyserMC/Geyser/master/LICENSE
curl -sSL https://raw.githubusercontent.com/GeyserMC/mappings/master/LICENSE
curl -sSL https://raw.githubusercontent.com/GeyserMC/mappings/master/README.md
curl -sSL https://raw.githubusercontent.com/GeyserMC/mappings-generator/master/README.md

# Current Java version
curl -sS https://launchermeta.mojang.com/mc/game/version_manifest_v2.json
```
