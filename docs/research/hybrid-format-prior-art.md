# Has anyone built a server that consumes two Minecraft content formats at once?

Researched 2026-10-24 against the source of 25 repositories at pinned commits (shallow, blobless or
sparse clones under `/tmp/bds-research-hybrid/`, read only, nothing built) and against Mojang's
published schemas and documentation. This note answers the format fusion and pack loading question that
[Prior art: how other servers and engines turn Minecraft into data plus components](prior-art-data-driven-servers.md)
left open; that note profiles 17 projects on how they model blocks, items and entities, and those
profiles are not repeated here. Every claim names a file and line, a decoded data file, or a URL.
Nothing here is legal advice.

## Summary

1. Nobody loads both pack formats. No project reads Java datapacks and Bedrock behavior packs into
   one runtime. The projects that hold both editions in one codebase (Chunker, Geyser, ViaBedrock,
   Amulet) all translate *world and wire data*, not packs. The hybrid this project is considering has
   no precedent to copy wholesale, only two halves to copy separately.
2. Chunker is the design worth studying, and it is closer to Mojang than its repository owner
   suggests. Hive Games maintains it, Mojang Studios funds it, Microsoft documents it, and it is MIT
   (`chunker/README.md:134-139`, `chunker/LICENSE:1-3`). It uses a neutral intermediate model
   (`ChunkerVanillaBlockType`, 1,292 constants) with per-edition per-version resolvers in code, and it
   proves the mapping with five property tests per version per edition, including a full round trip.
3. Chunker's real cost is visible and large. The vanilla block mapping is 8,309 lines of resolver code
   plus 2,710 lines of state groups, not a data table. 62 of its 142 Bedrock state groups and 26 of
   its 135 Java state groups carry explicit per-version branches. The losses are an allow list:
   183 Bedrock identifiers declared unsupported and 12 declared lossy, against 0 unsupported and 1
   ambiguous on the Java side.
4. The one working Bedrock behavior pack loader outside BDS is AddonBridge, a PowerNukkitX plugin
   (2026-09-02, 11,829 lines of Java, GraalJS embedded for `@minecraft/server`). It has no LICENSE
   file. It also ignores `format_version` entirely and collapses roughly 60 `minecraft:behavior.*`
   goals onto 21 switch arms over about 12 PowerNukkitX executors. It proves the format can be
   loaded. It does not prove the format can be loaded faithfully.
5. The one working Java datapack loader outside Mojang's server is Pumpkin. Minestom's `DataPack` is
   a two-field marker with no loader, valence and cuberite have no datapack code at all, and
   Glowstone's loader stalled in 2022 with loot tables and advancements commented out and
   `getDatapackManager()` throwing `UnsupportedOperationException`.
6. The TypeScript half already exists in reusable pieces. `mc-datapack-loader` (MIT, 1,021 lines)
   reads packs from zip, directory or `FileSystemDirectoryHandle`, implements `min_format`/`max_format`
   and `overlays`, and implements all three vanilla merge modes. `vanilla-mcdoc` (MIT, 246 schema
   files with `#[since=]`/`#[until=]` gating) plus `@spyglassmc/mcdoc` (MIT) validate datapack JSON
   per version. No equivalent exists for Bedrock in TypeScript.
7. The most complete bidirectional Java to Bedrock block database, Amulet's PyMCTranslate (229,296
   JSON files, 1.0 GB, 102 version directories), is now proprietary: "All rights reserved. A licence
   must be purchased to use this software." It was MIT in 2019, PolyForm Shield plus Noncommercial in
   2022, and closed in the 2026-01-09 commit. Amulet-Core carries the same notice. Neither is usable.
8. Of the four public mapping data sets, exactly one is open, maintained, current and machine-readable:
   GeyserMC/mappings (MIT, Java 26.3 to Bedrock 1.26.50). It is one way only, which turns out to be the
   right shape for this project.
9. The recommendation is architecture (b), Bedrock as the internal model with Java datapacks compiled
   into it at load time, not (c). The decisive fact is asymmetric: a Java datapack almost never
   *defines* a block, item or entity, it *references* vanilla ones, while a Bedrock behavior pack is
   the only one of the two that can define new content a Bedrock client renders. References need a
   one-way table of about 1,300 blocks and 1,650 items, which Geyser already publishes under MIT.
   Definitions need no table at all if the runtime speaks Bedrock identifiers.
10. Copy Chunker's test suite verbatim, not its model. Every palette entry maps, the output carries
    exactly the declared state set, the round trip is identity except for a reviewed loss list, and
    the output identifier and states exist in the real palette for that version.

## 1. Java datapacks outside Mojang's server

| Project | Reads datapacks | Registries covered | Validation | Versioning | License |
|---|---|---|---|---|---|
| Pumpkin | Yes, from `<world>/datapacks` | recipes, functions, loot tables, structures, template pools, processor lists, damage types, trades, generic dynamic registries | none; unknown loot types return `None` | reads `pack_format`, never rejects | GPL-3.0 |
| Minestom | No | n/a | n/a | n/a | Apache-2.0 |
| valence | No | n/a | n/a | n/a | MIT |
| cuberite | No | n/a | n/a | n/a | Apache-2.0 |
| Glowstone | No (API throws) | loader module covers recipes, predicates, 5 tag types, functions, structures; advancements and loot tables commented out | none | pre-1.21 plural directory names | MIT (both repos) |
| Paper | Delegates to vanilla, exposes an API | all of vanilla's | vanilla's compatibility check | `Compatibility.TOO_OLD`/`TOO_NEW` | GPL-3.0, with per-contributor MIT opt-in |
| Fabric | Adds every mod jar as a datapack | all of vanilla's | vanilla's | mod metadata load ordering | Apache-2.0 |
| mc-datapack-loader (TS) | Yes, reader only | 56 resource locations | none, reading only | `min_format`/`max_format`, `overlays`, legacy plural paths | MIT |

### 1.1 Pumpkin

The earlier note covers Pumpkin's loader in detail (section 3 of
[prior-art-data-driven-servers.md](prior-art-data-driven-servers.md)). The two facts that matter here:
embedded vanilla content loads first so on-disk packs override it by id, and `pack_format` is read
with `unwrap_or(61)` and never validated. Pumpkin is also the only project in this set that evaluates
Mojang's worldgen JSON rather than transcribing it.

### 1.2 Minestom

Minestom does not read datapacks from disk. `src/main/java/net/minestom/server/gamedata/DataPack.java`
is a 24-line sealed interface with two constants, `MINECRAFT_CORE` and `MINESTOM_UNNAMED`, and one
method, `isSynced()`, whose Javadoc says "Returns true if this data pack is synced with the client"
and carries a TODO to base that on the client's known-packs response. `DynamicRegistry.register(Key, T,
DataPack)` takes it purely as a label so the registry sync packet can exclude vanilla entries
(`DynamicRegistryImpl.java:238-253`). The only override mechanism remains a same-named file in the
working directory shadowing the classpath JSON. Minestom no longer ships an extension system; the
repository has no extensions module.

### 1.3 valence and cuberite

Neither contains datapack code. A case-insensitive search for `datapack` across `valence/crates` and
`cuberite/src` returns nothing, and valence's only `pack.mcmeta` hit is a translation key string in
`crates/valence_lang/extracted/translation_keys.json`.

### 1.4 Glowstone and redstone-transformer

Glowstone (MIT, `e9aeaa46`, last commit 2026-05-18) throws from the Bukkit API:
`GlowServer.java:3033-3034` is `public @NotNull DatapackManager getDatapackManager() { throw new
UnsupportedOperationException("Datapacks are not yet supported."); }`. Its vanilla recipes, tags and
fuels come from a separate Maven artifact built by GlowstoneMC/redstone-transformer (MIT,
`06380f8d`, last commit 2022-09-18), which runs Mojang's data generator at build time and generates
`VanillaRecipeManager`, `VanillaTagManager` and `VanillaFuelManager` classes from the output.

That repository does contain a real loader, `data-pack/loader/.../DataPackLoader.java` (267 lines). It
reads `pack.mcmeta`, walks `data/<namespace>/`, and loads functions, predicates, recipes, structures
and five tag types. Advancements and loot tables are wired up but commented out at the call site
(`loadDataWithName`, lines 131-152: `Collections.emptyMap()/*loadAdvancements(namespacePath)*/` and
`Collections.emptyMap()/*loadLootTables(namespacePath)*/`). Line 120 carries the comment
"TODO: bleh, since 20w45a, there is no more pack.mcmeta D:". The directory names it resolves
(`advancements`, `loot_tables`, `tags/blocks`) are the pre-1.21 plural forms. This is what a stalled
datapack loader looks like.

### 1.5 Paper

Paper does not reimplement loading; it exposes vanilla's `PackRepository` through an API, and that API
is the best available vocabulary for the Java side of a pack stack.
`paper-api/.../io/papermc/paper/datapack/DiscoveredDatapack.java` exposes `getName`, `getTitle`,
`getDescription`, `isRequired` ("A 'required' datapack will always be enabled on server startup, even
if previously disabled"), `getCompatibility`, `getRequiredFeatures` (a `Set<FeatureFlag>`) and
`getSource`. `Datapack.java` adds `isEnabled`, `setEnabled` ("Will cause a reload of resources
(`/minecraft:reload`) if any change happens"), and two enums: `Compatibility { TOO_OLD, TOO_NEW,
COMPATIBLE }` and `Position { TOP, BOTTOM }`. `DatapackRegistrar` lets a plugin inject a pack from
inside its own jar during a `DATAPACK_DISCOVERY` lifecycle event, and its Javadoc warns that
"if a datapack should stay available to the server, it must always be discovered whenever this event
fires".

### 1.6 Fabric

Fabric treats every mod jar's `data/` directory as a datapack and pushes them into vanilla's
`ResourcePackManager`. `fabric-resource-loader-v0/.../ModResourcePackUtil.java:298` constructs
`new ResourcePackManager(new VanillaDataPackProvider(...), new ModResourcePackCreator(ResourceType.SERVER_DATA, true))`.
What Fabric adds on top of vanilla is deterministic ordering declared by the pack rather than inferred
from discovery order: `addLoadOrdering` (lines 119-141) reads `before` and `after` mod id lists from
mod metadata and feeds a topological sorter, and `refreshAutoEnabledPacks` (143-166) walks the enabled
list and inserts hidden child packs whose parents are enabled. Optional packs go through
`ResourceManagerHelper.registerBuiltinResourcePack(Identifier, ModContainer, ResourcePackActivationType)`.

### 1.7 TypeScript and JavaScript

`jacobsjo/mc-datapack-loader` (MIT, `22ca1432`, 2026-01-04, v0.6.1, 1,021 lines of TypeScript,
dependencies `jszip` and `strip-json-comments`) is the only TypeScript datapack reader found. It is
worth reading in full because it already solves the parts this project would otherwise write twice:

- `src/DataType.ts` declares 56 `ResourceLocation` constants, each carrying a merge mode of
  `"override"`, `"tags"` or `"assign"`, plus the deprecated plural paths (`LEGACY_LOOT_TABLE =
  this.JSON_DATA("loot_tables")`) for packs written before the 1.21 singular rename.
- `src/Datapack/CompositeDatapack.ts` implements the three merge modes directly: `override` returns
  `datapacks[has.lastIndexOf(true)]`, `tags` concatenates `values` and resets the list whenever a
  pack sets `"replace": true`, and `assign` shallow-merges objects (used for language files).
- `src/PackMcmeta.ts` handles both the old `pack_format` integer and the `min_format`/`max_format`
  pair, and `src/Datapack/OverlaiedDatapack.ts:71` skips overlay resolution at or below pack format 15
  because "no overlays in 1.20.1 and earlier". Read `PackFormat.compare` before copying that line: it
  returns 1 when the receiver is the *older* version, so the comparison reads backwards.

It reads packs and does not evaluate them. `misode/deepslate` (MIT) evaluates worldgen and holds the registry and
tag machinery but ships no vanilla data and has no pack loader (earlier note, section 1.16). Nobody has
wired the two into a server. `SpyglassMC/Spyglass` (MIT) parses, binds and checks datapacks but is a
language server, and it fetches its vanilla data at runtime from `misode/mcmeta` and its schemas from
`https://api.spyglassmc.com/vanilla-mcdoc/tarball`
(`packages/java-edition/src/dependency/mcmeta/versions.ts:14`, `dependency/index.ts:146-151`).

## 2. Bedrock behavior packs outside Mojang's BDS

| Project | Reads behavior packs | What it loads | Validation | Versioning | License |
|---|---|---|---|---|---|
| Allay, PowerNukkitX, Cloudburst, Dragonfly, Nukkit | No | packs are forwarded to clients only | n/a | n/a | LGPL/GPL/MIT, see earlier note |
| AddonBridge (PNX plugin) | Yes | items, blocks, entities with component groups and events, `behavior.*` AI, loot tables, spawn rules, recipes, item catalog, `scripts/**.js` | `/addons check` cross-checks BP against RP | none; `format_version` ignored | no LICENSE file |
| nukkit-addon-bridge | Partially (MVP) | custom blocks and entities into a "common model" | DTOs generated from Blockception schemas | per-`format_version` DTOs with closest-lower fallback | no LICENSE file |
| Endstone | No, BDS does | BDS's own `ResourcePackRepository` | BDS's | BDS's | Apache-2.0 |
| Geyser | No | Bedrock *resource* packs only, served to clients | manifest parse | manifest `format_version` 2 | MIT |

### 2.1 The servers that forward packs instead of reading them

The earlier note established at pinned commits that Allay, PowerNukkitX, Dragonfly, Cloudburst and
Nukkit all discover behavior packs and forward them to clients without interpreting any of their JSON
server-side (section 3 of [prior-art-data-driven-servers.md](prior-art-data-driven-servers.md)). That
has not changed. Their own vanilla content is compiled in or loaded from network dumps.

### 2.2 AddonBridge

`Wyze3306/AddonBridge` (`53a73760`, "Release 1.1.0", 2026-09-02; the `sabahmax-inc` fork named in
search results is gone) is a PowerNukkitX plugin, 69 Java files and 11,829 lines, that loads
`.mcaddon`, `.mcpack`, `.zip` and extracted folders from `plugins/AddonBridge/addons/`. Its README
reports a representative load as "10232 items, 420 blocks, 29 entities, 10126 recipes, 11 loot tables,
16 spawn rules, 40 creative groups, 7 resource packs" plus "5 modules, 10 custom components".

What it gets right and a hybrid should copy:

- It forwards unknown components to the client unchanged (`passthrough-unknown-components`), so
  rendering stays correct for components the server does not model.
- It names unimplemented script API methods on the console and through `/addons scripts` instead of
  failing silently.
- `/addons check` cross-checks each behavior pack against the resource packs for item icons,
  geometries, armor attachables, texture files and client entity definitions, because "nothing in this
  pipeline fails loudly when a resource pack is incomplete".
- `ResourcePackPublisher.java:101-102` makes stack order a config choice with both options spelled out:
  "addons first, your own packs win conflicts" or "addons last, addon packs win conflicts".

What it gets wrong and a hybrid should not copy:

- It never parses `format_version`. The only occurrence in the entire source is
  `PackIndex.java:119`, `if (!name.startsWith("format_version"))`, which skips the key when listing
  sound definitions. Mojang's documented disambiguation rule, that the game parses the definition with
  the closest not-greater `min_engine_version`, has no implementation here.
- The AI is clustered, not translated. `ai/BehaviorMapper.java` (456 lines) has 21 `case` arms, and
  each one absorbs a family: `case "melee_attack", "delayed_attack", "melee_box_attack",
  "guardian_attack", ...` all become a `MeleeAttackExecutor`, and `case "eat_block",
  "eat_carried_item", "eat_mob", "nap", "graze"` all become one behavior. Navigation and movement
  components choose the route finder and controllers (lines 356-360). The README is honest about the
  rest: no Molang engine, so `permutations` conditions "reach the client as written rather than being
  evaluated server side", and `trading/`, `dialogue/` and server-side `animation_controllers` are not
  loaded.
- There is no LICENSE file. By default that is all rights reserved.

### 2.3 nukkit-addon-bridge

`EaseCation/nukkit-addon-bridge` (`45e0be6e`, 2025-11-04, no LICENSE file) is an MVP that is
architecturally more interesting than AddonBridge even though it does less. Its README describes
parsing add-on JSON into a "通用模型" (common model) and registering through per-fork adapters
(Cloudburst/Nukkit, PM1E, Nukkit-MOT, PowerNukkitX), with the core module having no Nukkit dependency.
Two design choices are worth taking:

- Its DTOs are generated, not hand-written. `codegen/` is a TypeScript generator that reads
  Blockception's `Minecraft-bedrock-json-schemas` (vendored as a Git submodule at `schemas/`) and emits
  Java 17 records and sealed interfaces into `addon-bridge-core/.../dto/`.
- It versions by generating one DTO package per `format_version` and resolving unknown versions to the
  closest lower supported one. `docs/version-fallback-strategy.md` lists eight supported versions from
  1.19.0 to 1.21.60 and states the three rules: exact match, largest supported version not exceeding
  the target, and oldest supported version when the file is older than all of them.
  `docs/multi-version-usage-guide.md` shows the pipeline: `format_version` to
  `dto.entity.v1_21_60.Entity` to `EntityComponentsV1_21_60` to a version-independent
  `IEntityComponents` interface.

### 2.4 Endstone and the BDS wrappers

Endstone (Apache-2.0, `bb0475b6`) embeds BDS and hooks its pack repository rather than parsing packs.
`src/endstone/core/server.cpp:311-371` takes a reference to the real `ResourcePackRepository` and
activates archives dropped into `resource_packs/`, with comments that spell out the vanilla rules it
preserves: "Packs listed in `world_resource_packs.json` are already on the stack" (line 350),
"Activate the archives dropped into `resource_packs`, which BDS discovers but leaves off the stack"
(356), "An extracted pack is left to `world_resource_packs.json`, as it is in vanilla" (366).
LeviLamina and bdsx are BDS mod loaders by design and were not read for this note, but the same
reasoning applies: BDS does the pack loading. These projects tell you nothing about how to build a
loader, only which behavior to match.

## 3. Projects that hold both formats

### 3.1 Chunker

`HiveGamesOSS/Chunker`, `50aaf6d8`, MIT, 988 Java files and 91,905 lines. The README states
"This project is maintained by Hive Games. This project receives funding from Mojang Studios. Mojang
Studios and it's parent company Microsoft assume no responsibility for the contents of this project",
and links the Microsoft Creator Docs page. It converts worlds between 20 Java target versions (1.11
through 26.3) and 27 Bedrock target versions (1.13 through 1.26.60). It reads neither datapacks nor
behavior packs: a search for `behavior_pack`, `resource_pack`, `mcpack`, `mcaddon` and
`world_behavior_packs` across `cli/src/main/java` returns nothing.

**The neutral model.** `conversion/intermediate/` holds the third format. `ChunkerVanillaBlockType` is
a 1,390-line enum with 1,292 constants, each carrying a map color, a state set and a solidity flag:
`GRASS_BLOCK(0x7fb238, Set.of(VanillaBlockStates.SNOWY), true)`, `OAK_STAIRS(0x8f7748,
VanillaBlockStateGroups.STAIRS, false)`. States are 134 `BlockState<?>` constants over 70 value enums
(`Age_1`, `Age_15`, `Age_25`, `AttachmentType`, `BambooLeafSize`, `CopperGolemPose`, ...), grouped into
37 reusable sets in `VanillaBlockStateGroups`. The model is Java-shaped: state names are Java's
(`waterlogged`, `facing`, `half`, `axis`) with a handful of Bedrock-only axes carrying an explicit
prefix (`BEDROCK_FRAME_MAP_BIT`, `BEDROCK_FRAME_PHOTO_BIT`). Only four of the 1,292 constants are
edition-exclusive: `MOVING_PISTON_JAVA`, `MOVING_BLOCK_BEDROCK`, `ITEM_FRAME_BEDROCK`,
`INVISIBLE_BEDROCK`. `ChunkerVanillaItemType` adds 471 non-block items;
`ChunkerItemStackIdentifier` is "a block (with states) or item as an identifier", so block items reuse
the block enum. `ChunkerVanillaEntityType` has 165 constants. `ChunkerBiome` is a name plus aliases
plus an optional `getFallback()` "used when biomes are discontinued and have a suitable replacement",
for example `WINDSWEPT_HILLS("minecraft:windswept_hills", "minecraft:extreme_hills")`.

The comment on `VanillaBlockStates.WATERLOGGED` (lines 13-20) shows what a neutral model has to
absorb. Waterlogging sits in `DEFAULT_BLOCK_STATES` and applies to every block, "because every block
in Bedrock is waterloggable but only some in Java are". The neutral model therefore carries a state
that one edition treats as universal and the other as per-block.

**The mapping is code, not data.** `cli/data/` holds palettes, not mappings: 51 Java directories each
with `blocks.json`, `items.json` and `version.json` copied verbatim from
`net.minecraft.data.Main --reports` by `cli/data/generate_java.py`, and 58 Bedrock directories each
with `block_states.json` and `item_names.json`, 597 MB total. The mapping itself is four resolver
classes totalling 8,309 lines (`BedrockBlockIdentifierResolver` 3,234, `JavaBlockIdentifierResolver`
1,825, `BedrockLegacyBlockIdentifierResolver` 1,798, `JavaLegacyBlockIdentifierResolver` 1,118) plus
2,710 lines of state groups, plus 2,451 lines of item resolvers. A mapping is a line:
`register(BlockMapping.of("minecraft:grass_path", ChunkerVanillaBlockType.DIRT_PATH))`. Version drift
is an `if` inside `registerMappings(Version version)`: 19 such branches on the Java side, 36 on the
Bedrock side.

**Four mechanisms carry the hard cases.**

- An identifier plus a state value can select a different type:
  `register(BlockMapping.of("minecraft:torch", "torch_facing_direction", "top",
  ChunkerVanillaBlockType.TORCH))` on line 910 and
  `register(BlockMapping.of("minecraft:torch", ChunkerVanillaBlockType.WALL_TORCH,
  BedrockStateGroups.TORCH_FACING))` on 912 split one Bedrock identifier into two Chunker types.
- Many-to-one must be declared. `ChunkerBlockIdentifierResolver` throws
  `"Duplicate state lookup entry"` (line 84) unless the registration names which direction is the
  duplicate: `registerDuplicateInput`, `registerDuplicateOutput`, `registerDuplicateOverrideInput`,
  `registerDuplicateOverrideOutput`. The Bedrock resolver uses 16, 50, 2 and 5 of them respectively
  against 701 plain registrations; the Java resolver uses 3 in total against 750.
- Coupled state axes use `multiState`. `BedrockStateGroups.DOOR` (line 336) maps the four Bedrock keys
  `door_hinge_bit`, `upper_block_bit`, `direction`, `open_bit` to four Chunker states as one unit
  rather than four independent conversions.
- Per-version state schema drift uses `VersionedStateMappingGroup`. 62 of 142 Bedrock groups and 26 of
  135 Java groups are versioned. `JavaStateGroups.BARRIER` is the clean example: a default group that
  outputs `WATERLOGGED=false` plus `.version(new Version(1, 20, 2), ...)` with the comment
  "1.20.2 added the waterlogged field".

**Custom content passes through untouched.** `handleFallback(Identifier)` (lines 379-386) returns a
`ChunkerCustomBlockType` for any identifier that is namespaced and does not start with `minecraft:`,
carrying its states verbatim, and the reverse writes them back out. Chunker attaches a user-supplied
mappings file (`-m/--blockMappings`) to the neutral identifier as a `PreservedIdentifier` rather than
replacing the identifier (`handleConverterMapping`, lines 300-318), so a user override travels
alongside the neutral identifier instead of changing it. `MappingsFile.java:19-53` documents that
file format:
`identifiers` with `old_identifier`/`new_identifier`/`state_list`, named `state_lists` of
`old_state`/`new_state`/`type`, and named `types` of `input`/`output` pairs, with `$custom_block` as a
catch-all handler key.

**The tests are the reason to trust it.** `BedrockBlockIdentifierValidationTests.perVersionTests()`
(line 550) enumerates every one of the 58 Bedrock palette files, expands each entry with both
`waterlogged=false` and `waterlogged=true`, and emits five dynamic tests per version:

1. every palette identifier and state maps to a Chunker output, unless it is in `UNSUPPORTED_BLOCKS`
   (`assertEquals(UNSUPPORTED_BLOCKS.contains(...), resolver.to(input).isEmpty(), ...)`, line 672,
   which fails in both directions, so an unsupported entry that starts mapping also fails);
2. the Chunker output carries exactly the state set the type declares, no missing and no extra
   (lines 723-731);
3. the round trip Bedrock to Chunker to Bedrock is identity, except for entries in `LOSSY_BLOCKS`
   (lines 681-688);
4. every Chunker type reachable in that version maps back to a Bedrock identifier (line 695);
5. the produced identifier and states exist in that version's real palette (lines 705-710).

The loss lists are small and annotated. `UNSUPPORTED_BLOCKS` holds 183 Bedrock identifiers grouped by
comment into "Debug/Technical blocks", "Old unused blocks", "Education Blocks" (chemistry tables,
colored torches and 36 `hard_*` glass variants) and "Elements" (120 entries). `LOSSY_BLOCKS` holds
12 entries, each
with a reason: `minecraft:lava_cauldron` "Migrated to :cauldron[cauldron_liquid=lava]",
`minecraft:frame` "Becomes a block entity", `minecraft:red_mushroom_block` with
`huge_mushroom_bits=15` "Remapped to mushroom_stem (stem all faces)". The Java side has an empty
`UNSUPPORTED_BLOCKS` and a one-entry `AMBIGUOUS_WITHOUT_STATES` (`minecraft:cauldron`, because before
1.17 the level indicated whether it held water). The README is equally explicit about what is out of
scope: "Entities (excluding paintings / item frames)" and "Structure data (e.g. Villages /
Strongholds)" do not convert.

### 3.2 GeyserMC

Three repositories, all MIT. `GeyserMC/mappings` (`81700ab5`) carries the data, generated for
"Minecraft: Java Edition 26.3 and Minecraft: Bedrock Edition 1.26.50". `GeyserMC/mappings-generator`
(`99aa4011`) produces it with Fabric's data generation API against the Java server plus downloaded
copies of `CloudburstMC/Data` and `Mojang/bedrock-samples`. `GeyserMC/Geyser` (`dd1fab33`) consumes it.

The block mapping is one way and positional. Decoding `blocks.nbt` (64,859 bytes gzipped) gives a
single root compound with one key, `bedrock_mappings`, holding a list of 35,723 compounds, one per
Java block state in registry order. 33,738 of them carry a `state` compound of Bedrock state names and
values; only 3,824 carry a `bedrock_identifier` string, because `BlockRegistryPopulator.java:469`
falls back to the Java name: `String bedrockIdentifier = "minecraft:" +
nbt.getString("bedrock_identifier", state.block().javaIdentifier().value())`. An entry with neither
key is `{}`, meaning same name and no states. `buildBedrockState` then emits `{name, states}` and the
rest of Geyser hashes it. There is no Bedrock to Java block registry. Geyser never needs one, because
the Java server upstream decides what the blocks are.

`items.json` is 1,658 entries keyed by Java item id, values like
`{"bedrock_identifier": "minecraft:acacia_button", "firstBlockRuntimeId": 12514, "is_block": true,
"lastBlockRuntimeId": 12537}` and `{"bedrock_identifier": "minecraft:filled_map"}` for
`minecraft:abandoned_camp_map`. `biomes.json` is 67 entries of `{"bedrock_id": <int>}`. The
generator's README lists 14 further files including `interactions.json`, `block_shapes.nbt`,
`collisions.nbt` and `item_data_components.json`, and it is candid about the manual residue: "in some
instances (especially with particles and sounds), you will have to do manual mapping of some kind",
and "The generator will alert you when manual mapping is necessary: take note of error logs in the
generator's output, which are highlighted in red".

Geyser's own extension format is a precedent for versioning a mapping file.
`MappingsConfigReader.readCustomMappings` (lines 103-110) reads an integer `format_version` from the
file root, looks up `type.readers().getOrDefault(formatVersion, null)`, and logs
"has an unsupported format version" rather than guessing. The repository ships
`ItemMappingsReader_v1`, `ItemMappingsReader_v2`, `BlockMappingsReader_v1`,
`SkullMappingsReader_v1` and `WaypointStyleMappingsReader_v1`.
`BlockMappingsReader_v1` builds Bedrock custom blocks from Bedrock component vocabulary
(`GeometryComponent`, `MaterialInstance`, `PlacementConditions`, `TransformationComponent`,
`CustomBlockPermutation`), which is the same shape a behavior pack would supply.

Geyser reads Bedrock *resource* packs (`core/.../pack/GeyserResourcePack.java`,
`GeyserResourcePackManifest.java`) only to serve them to clients. It never parses behavior packs.

### 3.3 ViaBedrock

`RaphiMC/ViaBedrock` (`48007327`, GPL-3.0) is the opposite direction from Geyser: a Java client
talking to a Bedrock server. Its README states "ViaBedrock is in very early stages of development and
NOT intended for regular use yet."

Its mapping is a flat data file and it is big.
`src/main/resources/assets/viabedrock/data/custom/blockstate_mappings.json` is 4.2 MB holding 22,091
entries of full blockstate string to full blockstate string:
`"minecraft:acacia_button[button_pressed_bit=0,facing_direction=1]"` maps to
`"minecraft:acacia_button[face=floor,facing=north,powered=false]"`. `item_mappings.json` is 2,076
entries keyed by Bedrock identifier with a `meta` or `block` discriminator:
`"minecraft:acacia_button": {"block": {"minecraft:acacia_button": {"java_id": "minecraft:acacia_button"}}}`.

`Data Asset Sources.md` is the most honest provenance file in this set, naming a pinned commit for
every input: the Bedrock palette from a pinned Geyser resource, biome definitions and runtime item
states from pinned `CloudburstMC/Data` commits, legacy id maps from PMMP's
`BedrockBlockUpgradeSchema`, entity identifiers and item tags from `Kaooot/bedrock-network-data`,
block traits from Microsoft Learn plus `Mojang/bedrock-samples` plus `wiki.bedrock.dev`, Java mappings
from `ViaVersion/Mappings`, and game rules "dumped from a BDS server using CloudburstMC/ProxyPass".

`Update Process.md` is the maintenance cost of a hand-curated bidirectional table, written down. Seven
Gradle tasks exist purely to keep the mapping honest: `reportMappingGaps` ("what is missing, stale or
pointing at something java dropped"), `reportMappingMistakes` ("what loads fine but disagrees with the
rest of the data"), `syncDerivedMappings`, `proposeMappings`, `selfTestMappings` ("hides each mapped
block and checks the proposer reproduces it by hand"), `applyMappingProposals` and `validateMappings`.
The three mistake categories it reports are worth quoting because they name the three ways a mapping
table drifts out of date:

- `identity-available`, "a mapping pointing somewhere else although java has an item or block of
  exactly that name and nothing else claims it. That is what a family copied from an older one looks
  like once java catches up, like every `poplar_*` item sitting on `pale_oak_*`";
- `family-outlier`, "a block translating its properties differently from the blocks which have the
  same properties on both sides";
- `ignored-property`, "a bedrock property which never changes the java state although java has a
  property of that name".

### 3.4 Amulet and PyMCTranslate

`Amulet-Team/PyMCTranslate` (`41c4f040`, 2026-10-23) is the most complete public bidirectional
database and the clearest statement of architecture (c). Its README: "It enables translating data
between a large number of Minecraft versions and platforms via an in-between format known as the
Universal format. This Universal format is a custom format independent of any Minecraft version ...
The project is made up of a large number of specification and mapping files that are independent of
any programming language making it a very flexible system."

Scale: 102 version directories (59 Bedrock from 1.1.0 to 26.50, 42 Java from 1.12.2 to 26.3, plus
`universal`), 229,296 JSON files, 1.0 GB. Despite the README's claim of block entities, entities and
items, every version directory in this checkout contains only `block/`.

The universal model normalizes differently from Chunker's, and anyone building a neutral model has to
pick one of the two. Chunker has 1,292 flat constants matching Java's flattened names. PyMCTranslate
has 420 universal types plus 25 Bedrock-only ones, because it refolds the flattening into orthogonal
properties. `universal/block/blockstate/specification/universal_minecraft/vanilla/log.json` declares
one `log` type with three properties: `material` with 13 values, `axis` and `stripped`.
Java's `oak_log` maps to it with three functions
(`new_block: universal_minecraft:log`, `new_properties: {material: "oak", stripped: "false"}`,
`carry_properties: {axis: [x, y, z]}`), and Bedrock's `oak_log` maps to the same thing but has to
rewrite `pillar_axis` into `axis` through a `map_properties` branch per value.

The mapping language is a small declarative interpreter, documented in `PyMCTranslate/README.md:68-125`:
`new_block`, `new_properties`, `new_nbt`, `carry_properties`, `multiblock` (reaches into neighboring
blocks, used for doors and chests, allowed only toward universal), `map_properties`, `map_block_name`
and `map_nbt`. 28 Python `code_functions` are the escape hatch for what the language cannot express
(signs, skull rotation, chest pairing, banner patterns, command block custom names). Its failure rule
is worth copying: "In these cases the input blockstate should be given as the output so that if
converted back to the input version no data will be lost."

**It is not usable.** `LICENSE` reads in full: "Copyright (c) 2025 Amulet-Team / All rights reserved. /
A licence must be purchased to use this software. / See https://www.amuletmc.com/ for more details."
`Amulet-Team/Amulet-Core` (`ffb3dfcf`, 2026-10-12) carries the identical notice for 2026. The history
on `LICENSE` is four commits: MIT-style in 2019 (`da6c5447`) and 2020 (`03c27ff5`), "Amulet Team
License 1.0.0 / # This is a combination of PolyForm Sheild and Noncommercial" in 2022 (`4f9eadcf`),
and the all-rights-reserved text in `807083ff` (2026-01-09). The data files sit in the same repository
under the same license.

### 3.5 PrismarineJS/minecraft-data

minecraft-data does carry a cross-edition block mapping, and it is dead. `data/bedrock/1.19.1/blockMappings.json`
is a 22,658-entry array of `{"pc": {"name", "states"}, "pe": {"name", "states"}}` pairs:
`{"pc": {"name": "granite", "states": {}}, "pe": {"name": "stone", "states": {"stone_type": "granite"}}}`.
`schemas/blockMappings_schema.json` describes it as "Maps block names and states between PC and PE
(Bedrock) versions". `doc/bedrock.md:9` attributes it to the "bedrock-extractor". It exists for exactly
one version: a scan of `data/dataPaths.json` finds a single entry referencing `blockMappings`, pointing
at `bedrock/1.19.1`. No newer Bedrock version aliases it, and no PC version references it at all. The
earlier note already covers the quality problems in minecraft-data's Bedrock game data; this file adds
one more reason not to build on it.

### 3.6 Hydrofoil

No such project was found. Web search returns nothing matching a Minecraft server or converter named
Hydrofoil, and no GitHub repository of that name appeared in any of the searches run. Treat it as a
misremembered name until someone produces a URL.

## 4. Four candidate architectures

| | (a) Java internal, Bedrock translated in | (b) Bedrock internal, Java translated in | (c) Neutral model both compile into | (d) Two registries plus a boundary table |
|---|---|---|---|---|
| Who does this | Geyser (proxy, Java upstream) | nobody yet, closest is any Bedrock server plus a Java data importer | Chunker, PyMCTranslate | nobody for content; Geyser for runtime only |
| What breaks | every chunk read, chunk send and world write becomes a translation; Bedrock pack content has to be expressed as Java blocks, the direction only ViaBedrock attempts | Java data that references a state axis Bedrock lacks must resolve or be dropped at compile time | a third identifier space nobody speaks: logs, commands, plugin API, world files and protocol all need edge translation | identifier collisions have no rule to resolve them; at Bedrock 1.19.1 `minecraft:stone` with a `stone_type` state covers seven separate Java blocks from `stone` to `polished_andesite`, while `minecraft:grass_path` exists only on Bedrock and is Java's `minecraft:dirt_path` |
| Mapping table cost | Java to Bedrock (free, Geyser) plus Bedrock to Java (ViaBedrock's 22,091 curated entries and 7 maintenance tasks) | Java to Bedrock only: Geyser's 35,723-entry generated table, regenerated per version | Chunker's actual bill: 1,292 type constants, 134 states, 70 value enums, 8,309 lines of resolvers, 2,710 lines of state groups, 88 of 277 state groups version-branched | two tables, both directions, with no single source of truth to test against |
| Identifier collisions | Java namespace wins; Bedrock-only content needs invented Java names | Bedrock namespace wins; Java-only names are compile-time aliases and never reach the runtime | the neutral name wins and is a third thing; `universal_minecraft:log` is in neither edition | unresolvable without a precedence rule that is itself a third model |
| Pack author experience | writes Java names, sees Java names; a Bedrock pack author sees their identifiers rewritten | writes Bedrock names in Bedrock packs, sees them unchanged; writes Java names in datapacks, sees them resolved at load with a logged mapping | both authors see their names rewritten into a third vocabulary in every error message | both authors see the other's registry leak into theirs |
| Degradation when Mojang changes one side | a Java change ripples through chunk storage | a Java change touches one generated table; a Bedrock change touches the palette, which already has to change | a change on either side touches the neutral model, both resolvers, and a version branch: Chunker needed version branches in 44% of its Bedrock state groups | a change on either side desynchronizes two tables with no round-trip test to catch it |

### Why the choice is (b)

The asymmetry that settles it is what each format actually contains.

A Java datapack almost never defines a block, item or entity type. It defines loot tables, recipes,
tags, predicates, item modifiers, advancements, damage types, enchantments, dimensions and worldgen,
and those are overwhelmingly *references* to vanilla identifiers. `mc-datapack-loader`'s 56 resource
locations are all of this shape. The references are a bounded set: about 1,300 Java blocks (1,286 at
26.3 in Chunker's committed report), 1,658 items in Geyser's table, 67 biomes.

A Bedrock behavior pack is the opposite: it is the only one of the two formats that can define a new
block, item or entity that a Bedrock client will render, because registration and the client-side
definition travel together in the add-on. Geyser's `BlockMappingsReader_v1` exists precisely to
synthesize that from the Java side, and a server operator has to write out the geometry, material
instances and placement filters by hand.

So the two sides need opposite treatment. References need a lookup table and nothing else.
Definitions need to survive untouched from disk to client. Architecture (b) gives both: the runtime
speaks Bedrock identifiers, so a `.mcpack` block keeps its name and states through the whole pipeline
with zero mapping, and a Java datapack's references get resolved once at load through a generated
one-way table.

Architecture (c) is what Chunker and PyMCTranslate chose, and both are batch converters with no live
clients, no plugin API and no persistent world of their own. A server pays the neutral model's cost
continuously: every command argument, every log line, every plugin API call, every LevelDB key and
every protocol field is in one of the two real vocabularies, never in the neutral one. Chunker's bill
for one content domain (blocks) across two editions is about 11,000 lines of mapping plus a 1,292-entry
enum, and 88 of its 277 state groups carry per-version branches. Treat that as the minimum, not the
estimate.

Architecture (a) inverts the cost into the hot path. Geyser can afford a Java-internal model because a
real Java server sits upstream and owns the world; this project owns a Bedrock world on disk, in
Bedrock LevelDB, with Bedrock sub-chunk palettes and FNV-1a hashed runtime ids. Making the internal
model Java would mean translating on every chunk load and save.

Architecture (d) is what results from not deciding. No project in this set keeps two parallel content
registries, and nobody can write the collision rules. The two editions agree on most names, disagree
on hundreds, and reuse the same name for different things. Bedrock's `minecraft:stone` with a
`stone_type` state covers seven Java block ids. Bedrock's `minecraft:torch` is Java's `torch` or
`wall_torch` depending on `torch_facing_direction`, which is why Chunker registers it twice
(`BedrockBlockIdentifierResolver:910,912`). Bedrock's `minecraft:frame` is a block that Chunker has to
turn into a Java block entity, with the comment "Needs to be turned into an entity" on line 955.

### What (b) must do to not collapse into a translation mess

1. Make the compile one way and load time only. Java data compiles into the Bedrock identifier space
   at datapack load. Nothing translates back. If a Java world ever needs to be imported, shell out to
   Chunker, which already solves that problem with tests.
2. Consume Geyser's table rather than writing one. `blocks.nbt` indexed by Java block state id,
   `items.json` by Java item id, `biomes.json` by Java biome name, all MIT. Section 5 covers the
   coupling risk.
3. Make every loss a declared, reviewed list entry, not a silent fallback. Copy the shape of Chunker's
   `UNSUPPORTED_BLOCKS` (183 entries, grouped by comment) and `LOSSY_BLOCKS` (12 entries, each with a
   reason). Make the test fail in both directions, as Chunker does, so an entry that starts resolving
   also fails and gets removed from the list.
4. Copy Chunker's five property tests, run one way. Every Java block state in the target version's
   report resolves or is on the list; the resolved Bedrock identifier and states exist in the Bedrock
   palette for the target version; a reference that resolves to a block with a Java-only state axis is
   either collapsed by a declared rule or listed as lossy.
5. Let non-`minecraft:` identifiers pass through untouched in both directions, as Chunker's
   `handleFallback` does. A behavior pack's `myaddon:ruby_block` never enters the mapping at all.
6. Keep the two pack loaders separate and the registry single. Two loaders writing into one registry is
   architecture (b). Two registries is architecture (d), which is the mess.

## 5. Identifier and namespace strategy

| Data set | Direction | Shape | Scale | Current | Maintained | License | Usable by an MPL-2.0 TypeScript project |
|---|---|---|---|---|---|---|---|
| GeyserMC/mappings `blocks.nbt` | Java to Bedrock | gzipped NBT, list indexed by Java block state id, optional `bedrock_identifier` and `state` per entry | 35,723 entries, 3,824 renames, 64 KB | Java 26.3 / Bedrock 1.26.50 | yes, generated | MIT (code and generated output; Mojang data explicitly not relicensed) | yes |
| GeyserMC/mappings `items.json`, `biomes.json` | Java to Bedrock | JSON object keyed by Java identifier | 1,658 items, 67 biomes | same | yes | MIT | yes |
| Chunker resolvers | both | Java source, `register(BlockMapping.of(...))` plus state groups | 8,309 + 2,710 lines | Java 26.3 / Bedrock 1.26.60 | yes | MIT | not as data; usable as a reference and as a port |
| Chunker `cli/data/` | neither (palettes) | `reports/blocks.json` verbatim, Bedrock `block_states.json` | 51 Java + 58 Bedrock versions, 597 MB | yes | yes | Mojang data under the EULA, not Chunker's MIT | as a local fixture, not redistributable |
| ViaBedrock `blockstate_mappings.json` | Bedrock to Java | flat JSON string to string of full blockstate strings | 22,091 entries, 4.2 MB | Java 26.3 / Bedrock 1.26.50 | yes, with 7 maintenance tasks | GPL-3.0 | no for an MPL-2.0 product, see §8 |
| PyMCTranslate `json/versions/` | both, via a universal model | per-block JSON mapping programs (`new_block`, `map_properties`, ...) plus specifications | 229,296 files, 1.0 GB, 102 versions | yes | yes | all rights reserved, purchase required | no |
| minecraft-data `blockMappings.json` | Java to Bedrock pairs | array of `{pc:{name,states}, pe:{name,states}}` | 22,658 entries | no, Bedrock 1.19.1 only | no | README says MIT, no LICENSE file | technically yes, practically useless |

### How each one encodes the disagreement

Chunker encodes it as two independent functions into one enum, with the state translation in a
named group. Nothing in the file says "Java `dirt_path` equals Bedrock `grass_path`"; instead
`JavaBlockIdentifierResolver` says `minecraft:dirt_path` to `DIRT_PATH` and
`BedrockBlockIdentifierResolver:158` says `minecraft:grass_path` to `DIRT_PATH`. The advantage is that
adding a third edition or an older version costs one more resolver, not N-squared tables. The
disadvantage is that the pairing exists only by composition and can only be checked by running the
round trip, which is why the round trip test is not optional.

Geyser encodes it positionally. The array index is the Java block state id, so there is no Java
identifier in the file at all. That makes it the smallest of the four, 64 KB against ViaBedrock's
4.2 MB for the same information in the other direction, and also the most fragile. A consumer must
hold the exact Java version's block state list in the exact registry order, or every lookup is
silently wrong by an offset. Geyser gets that list from the Java server it is embedded in. A standalone consumer gets it
from `misode/mcmeta`'s `summary/blocks/data.json` branch, or from the `reports/blocks.json` that
Chunker commits per version, where every state already carries its `id`.

ViaBedrock encodes it as a fully expanded string to string map. It is the easiest to consume from
any language and the most expensive to maintain, which is why the repository has a seven-task Gradle
toolchain and a written taxonomy of the ways the table goes wrong. `pre_waterlogged_blockstates.json`
and `potted_blockstates.json` hold the cases the main table cannot express.

PyMCTranslate encodes it as a mapping program per block per direction per version against a
refolded universal model. It is the most expressive of the four, the only one that can read
neighboring blocks (`multiblock`) and the only one that handles NBT, and the only one that is
unusable on license grounds.

### Can this project consume one directly?

Yes, Geyser's, with two conditions.

First, pin the Java version. `blocks.nbt` is only meaningful alongside the Java block state list it
was generated against, and Geyser's README names it ("generated for Minecraft: Java Edition 26.3 and
Minecraft: Bedrock Edition 1.26.50"). Store the Java state list from `reports/blocks.json` or mcmeta's
summary next to the mapping, assert the length matches `bedrock_mappings` (35,723 at 26.3), and fail
the build when it does not. That one assertion catches every off-by-one error the positional format
allows.

Second, accept that it is one way and that it is Geyser's definition of correct, which is "what makes a
Bedrock client render the right thing", not "what round trips". Chunker's resolvers are the place to
look when a mapping looks wrong, and Chunker's `LOSSY_BLOCKS` comments are the place to look for why a
case is unrepresentable.

Do not maintain a table by hand. ViaBedrock's `Update Process.md` is what that costs, and ViaBedrock
has to because nobody publishes the Bedrock to Java direction.

One further piece of data sits in the Java palettes and is worth taking while it exists. Mojang's own
`reports/blocks.json` gained a `definition` object in 1.20.5 that names the block's behavior family and
its constructor parameters: `minecraft:oak_door` is
`{"definition": {"type": "minecraft:door", "block_set_type": "oak", "properties": {}}}`, and
`minecraft:acacia_button` carries `"ticks_to_stay_pressed": 30`. At 1.21.11 that is 263 distinct
definition types over 1,166 blocks, led by `minecraft:block` (173), `minecraft:slab` (58),
`minecraft:rotated_pillar` (56) and `minecraft:stair` (54). This is Mojang publishing exactly the
definition-plus-behavior-family split the earlier note recommended. It is also a live demonstration of
the degradation question: in Chunker's committed reports the field is present for every block from
1.20.5 through 26.2 and absent from all 1,286 blocks at 26.3.

## 6. Pack precedence, merging and conflicts

### What Java does

Last enabled pack wins per file; tag files merge unless the later one sets `"replace": true`;
`/reload` covers loot tables, recipes, tags, predicates and functions but not dynamic registries;
`pack.mcmeta` carries `min_format` and `max_format` since 25w31a with optional `overlays`
(https://minecraft.wiki/w/Data_pack, https://minecraft.wiki/w/Pack_format; earlier note, section 3).

Three implementations add detail worth copying. Paper's API names the per-pack facts a loader must
track: name, title, description, `isRequired` ("always be enabled on server startup, even if
previously disabled"), `Compatibility { TOO_OLD, TOO_NEW, COMPATIBLE }`, required feature flags,
source, and `Position { TOP, BOTTOM }`. Fabric adds declared ordering: mods state `before` and `after`
mod id lists and a topological sorter resolves them (`ModResourcePackUtil.addLoadOrdering`), with
hidden child packs auto-enabled when their parents are
(`refreshAutoEnabledPacks`). `mc-datapack-loader` implements the merge semantics in 70 lines of
TypeScript with three modes attached to each resource type: `override` takes the last pack that has
the file, `tags` concatenates `values` and clears the accumulated list whenever a pack sets `replace`,
`assign` shallow-merges (language files only). Pumpkin loads embedded vanilla content first
specifically so disk packs override it by id.

### What Bedrock does

"Pack Stacking is how content is loaded on top of Vanilla content, causing each object that has the
same name in both packs to be overwritten by the latest applied pack", and "when content is loaded,
vanilla content is loaded first, followed by any Add-Ons"
(https://learn.microsoft.com/en-us/minecraft/creator/documents/resourcepack,
https://learn.microsoft.com/en-us/minecraft/creator/documents/behaviorpackfromscratch). Same-identifier
definitions are additionally disambiguated by engine version: "The definition with the same or closest
and not greater min_engine_version, as compared to the top resource pack's engine version, will be
parsed; all other definitions with the same identifier will not be parsed"
(https://learn.microsoft.com/en-us/minecraft/creator/reference/content/versiondisambiguation).
`header.version` decides replacement on import, and subpack files override main pack files. Mojang's
own cooperative add-on guidance admits the rule is not good enough in practice: when two packs change
the creeper "one will 'win' (based on pack stack order, which for most players is not set in any
particular intentful order)"
(https://learn.microsoft.com/en-us/minecraft/creator/documents/practices/guidelinesforbuildingcooperativeaddons).
BDS's own vanilla content is itself 56 layered packs composed by file name (earlier note, section 2).

The two implementations that exist diverge on this. AddonBridge makes order a config flag with both
meanings spelled out and ignores `min_engine_version` and `format_version` entirely.
nukkit-addon-bridge takes `format_version` seriously, generating a DTO package per supported version
and falling back to the largest supported version not exceeding the file's.

### What a combined stack should do

1. Keep one ordered stack, not two. Vanilla content first, then Bedrock packs, then Java datapacks,
   with Java datapacks last because they carry the gameplay rules the hybrid exists to get.
2. Resolve within a format by that format's own rules, because pack authors wrote against them.
   Java: last wins per file, tags merge unless `replace`. Bedrock: last wins per identifier, with
   `min_engine_version` disambiguation implemented, not skipped.
3. Resolve across formats by domain, not by identifier. A Bedrock pack defining `myaddon:ruby_block`
   and a Java datapack defining a loot table for it are not in conflict and must not be ordered
   against each other. Conflicts across formats only arise where both can express the same thing,
   which in practice is recipes, loot tables and spawn rules. Pick one owner per domain and log when
   the other format supplies the same id, rather than silently letting stack order decide.
4. Make the order explicit and declared. Take Fabric's `before`/`after` and topological sort rather
   than directory listing order, which is what Mojang's own guidance admits is "not set in any
   particular intentful order".
5. Validate `min_format`/`max_format` on the Java side and reject rather than guess, which is where
   Pumpkin's `unwrap_or(61)` falls down. On the Bedrock side implement the closest-not-greater rule
   from nukkit-addon-bridge rather than AddonBridge's silence.
6. Report the stack. `/addons check` exists in AddonBridge because "nothing in this pipeline fails
   loudly when a resource pack is incomplete". A combined stack doubles the number of ways a pack can
   be silently wrong, so it needs the equivalent command from the first release.

## 7. Validation and schema tooling

### Java

`SpyglassMC/vanilla-mcdoc` (MIT, `java/` only, 246 `.mcdoc` files) is the maintained schema set, and
it is version-aware at field granularity: `java/data/loot/mod.mcdoc` carries `#[until="26.3"]`,
`#[since="26.3"]`, `#[since="1.20"]`, `#[since="1.20.5"]` attributes on individual union arms, plus
`#[id=(registry="loot_table",tags="allowed")]` for identifier fields. The reader is
`@spyglassmc/mcdoc` (MIT), TypeScript, with parser, binder, checker and a runtime package.
`misode/minecraft-schemas` and all `@mcschema/` npm packages are MIT but formally retired: the README
note added 2025-02-15 says "This repository and all `@mcschema/` npm packages are no longer
maintained" and points at vanilla-mcdoc.

`misode/mcmeta` is the vanilla data source Spyglass and the misode web tools fetch at runtime. It has
no LICENSE file, by design: its disclaimer says "All data and assets were obtained through Mojang's
internal data generator and public API. If Mojang ever has something against this data existing here,
the repository will be promptly removed." Its branches are the useful part: `summary/blocks/data.json`
(block state properties and defaults), `summary/registries/data.json`, `summary/item_components/data.json`,
`data` and `data-json` (the vanilla datapack), one commit per version tagged `<version>-<branch>` back
to 1.14.

### Bedrock

Mojang publishes official schemas, and the community tools validate against their own instead.
`Mojang/bedrock-samples`
(`46ba6ea9`, tag 1.26.50.4) contains 969 files under `metadata/json_schemas/`, split 674 server,
168 client_server and 127 client, organized by area and then by format version. `server/entity/` alone
has 13 version directories from 1.21.80 to 1.26.50 plus `beta`, with 65 schema files at 1.26.50. They
are JSON Schema draft-07 with a Mojang extension: `ActorDocument.json` declares
`"$id": "/server/entity/1.26.50/ActorDocument.json"`, `"x-format-version": "1.26.50"`, per-property
`"x-ordinal-index"`, `$ref`s to sibling files, and `"required": ["description"]`. Ajv reads them as
is. `LICENSE.md` is "(c) Mojang AB. All rights reserved" plus the EULA.

The community alternatives are the two the earlier note covered: `Blockception/Minecraft-bedrock-json-schemas`
(BSD-3-Clause, 1,159 latest-superset schemas with per-component defaults and caveats) and
`bridge-core/editor-packages` (MIT, per-`format_version` schema tables selected with JSON Schema
`if/then`, 38 entity format versions, `formatVersions.json` listing 55). nukkit-addon-bridge
demonstrates the third use for them beyond validation: generating the loader's own DTOs
(`codegen/`, TypeScript, Blockception as a submodule).

No TypeScript *library* validates Bedrock packs. bridge. validates them in TypeScript, but inside a
web editor under GPL-3.0, not as something a server can import (earlier note, section 1.17). This is
the clearest place where the project would have to build rather than consume, and the build is small:
Ajv over Blockception's BSD-3-Clause schemas for what ships, with Mojang's own schemas downloaded
locally as a stricter check that stays out of the distribution.

## 8. Licensing synthesis

This repository is MPL-2.0 (`LICENSE`, `package.json:69`). MPL-2.0 is file-level copyleft. A
maintainer can add permissively licensed code (MIT, BSD, Apache-2.0) to it, and MPL-2.0 files can sit
beside differently licensed files in a larger work. Pulling GPL-family code in makes the combined work
GPL, which rules out shipping it. (The reusable-pieces table in
[prior-art-data-driven-servers.md](prior-art-data-driven-servers.md) says "this repository's MIT",
which does not match `LICENSE`; that row's conclusions still hold, since everything it clears for MIT
is also fine under MPL-2.0, but the premise should be corrected.)

The distinction that matters most here is code versus data. Every mapping data set in this note is
derived from Mojang's files, and the projects say so themselves. Geyser: "These files are licensed by
GeyserMC under the MIT license. Please note that GeyserMC only licenses the original work contributors
have the right to license. GeyserMC does not relicense Minecraft, its data, or any other material owned
by Mojang or Microsoft." Pumpkin's `assets/NOTICE.md` makes the same point. mcmeta's disclaimer makes
it a third time. So an MIT license on a mapping repository clears the *selection, structure and
generator*, not the underlying game data, which remains Mojang's under the EULA.

| Artifact | Kind | License | Usable here |
|---|---|---|---|
| HiveGamesOSS/Chunker | code | MIT | yes; port or depend on freely |
| Chunker `cli/data/` palettes | Mojang data | EULA (not covered by Chunker's MIT) | as a local, non-redistributed test fixture; regenerate with `generate_java.py` instead of vendoring |
| GeyserMC/mappings | generated data | MIT for the selection and structure; Mojang data not relicensed | yes, as a pinned dependency; do not claim the game data |
| GeyserMC/mappings-generator | code | MIT | yes |
| GeyserMC/Geyser | code | MIT | yes |
| RaphiMC/ViaBedrock (code and its bundled JSON) | code and data in one repo | GPL-3.0 | no; reference only, do not copy the JSON into the distribution |
| Amulet-Team/PyMCTranslate | code and data | all rights reserved, purchase required | no |
| Amulet-Team/Amulet-Core | code | all rights reserved, purchase required | no |
| SpyglassMC/vanilla-mcdoc | schemas | MIT | yes |
| SpyglassMC/Spyglass (`@spyglassmc/*`) | code | MIT | yes |
| misode/minecraft-schemas (`@mcschema/*`) | code | MIT, unmaintained since 2025-02 | works, but prefer vanilla-mcdoc |
| misode/mcmeta | Mojang data | no license file, explicit takedown disclaimer | fetch at build time, do not vendor |
| jacobsjo/mc-datapack-loader | code | MIT | yes, as a dependency or a copied shape |
| misode/deepslate | code | MIT | yes (earlier note) |
| Mojang/bedrock-samples `metadata/json_schemas/` | schemas | "(c) Mojang AB. All rights reserved" plus EULA | download and validate locally; do not redistribute |
| Blockception/Minecraft-bedrock-json-schemas | schemas | BSD-3-Clause | yes, with attribution |
| bridge-core/editor-packages | schemas | MIT | yes |
| bridge-core/editor | code | GPL-3.0 | no; the only TypeScript Bedrock pack validator, reference only |
| Wyze3306/AddonBridge | code | no LICENSE file (all rights reserved) | no; design reference only |
| EaseCation/nukkit-addon-bridge | code | no LICENSE file (all rights reserved) | no; design reference only |
| GlowstoneMC/Glowstone, GlowstoneMC/redstone-transformer | code | MIT | yes |
| Minestom | code | Apache-2.0 | yes |
| EndstoneMC/endstone | code | Apache-2.0 | yes |
| Pumpkin | code | GPL-3.0 | no; reference only |
| PrismarineJS/minecraft-data | data | README says MIT with a caveat, no LICENSE file | unresolved; do not depend on the Bedrock game data anyway (earlier note) |
| PaperMC/Paper | code | GPL-3.0, with named contributors opting into MIT (`LICENSE.md`) | no; the datapack API is a vocabulary to mirror, not code to copy |

## Open questions

- Mojang's `definition` field in `reports/blocks.json` is present for all 1,196 blocks at 26.2 and
  absent from all 1,286 at 26.3 in Chunker's committed reports. Whether that is a deliberate removal,
  a relocation to another report, or an artifact of how Chunker generated 26.3 was not confirmed
  against a freshly generated 26.3 report.
- Chunker's `cli/data/README.md` documents only the Java extraction (`generate_java.py`). How the 58
  Bedrock `block_states.json` and `item_names.json` files are produced is not written down anywhere in
  the repository, so the Bedrock half of its palette provenance is unverified.
- Geyser's `blocks.nbt` has no embedded version marker. Whether the generator writes one elsewhere, or
  whether consumers are expected to track it out of band, was not determined; a length assertion
  against the Java state list is the only check this note can recommend with confidence.
- Nobody has measured what the Java to Bedrock compile actually loses for a real datapack. The obvious
  experiment is to run the vanilla Java datapack from mcmeta through Geyser's table and count the
  references that resolve to a Bedrock block with a different state domain.
- AddonBridge and nukkit-addon-bridge both lack LICENSE files. Neither author was contacted; both may
  intend to be open.
- PyMCTranslate's README claims entities, items and block entities, but every version directory in the
  checkout contains only `block/`. Whether that data lives in a separate paid distribution was not
  determined.
- Whether `@minecraft/server` script execution belongs in a hybrid at all is untouched here.
  AddonBridge proves it is possible with GraalJS on a JVM; a TypeScript server would be running pack
  scripts in its own runtime, which is a sandboxing question this note does not address.

## Reproduction

```sh
mkdir -p /tmp/bds-research-hybrid /tmp/hybrid-tools && cd /tmp/bds-research-hybrid

# Full clones (Chunker and PyMCTranslate are about 1 GB each)
for r in HiveGamesOSS/Chunker:chunker GeyserMC/Geyser:geyser \
         GeyserMC/mappings-generator:geyser-mappings-generator GeyserMC/mappings:geyser-mappings \
         RaphiMC/ViaBedrock:viabedrock Amulet-Team/PyMCTranslate:pymctranslate \
         SpyglassMC/vanilla-mcdoc:vanilla-mcdoc jacobsjo/mc-datapack-loader:mc-datapack-loader \
         misode/minecraft-schemas:minecraft-schemas GlowstoneMC/redstone-transformer:glowstone-redstone-transformer \
         Wyze3306/AddonBridge:addonbridge EaseCation/nukkit-addon-bridge:nukkit-addon-bridge; do
  git clone -q --depth 1 "https://github.com/${r%%:*}" "${r##*:}"
done

# Blobless clones (checkout afterwards)
for r in GlowstoneMC/Glowstone:glowstone EndstoneMC/endstone:endstone misode/mcmeta:mcmeta \
         Amulet-Team/Amulet-Core:amulet-core PrismarineJS/minecraft-data:minecraft-data \
         SpyglassMC/Spyglass:spyglass Minestom/Minestom:minestom valence-rs/valence:valence \
         cuberite/cuberite:cuberite misode/deepslate:deepslate \
         Blockception/Minecraft-bedrock-json-schemas:blockception \
         bridge-core/editor-packages:bridge-editor-packages; do
  git clone -q --depth 1 --filter=blob:none "https://github.com/${r%%:*}" "${r##*:}"
done

# bedrock-samples: schemas only
git clone -q --depth 1 --filter=blob:none --no-checkout https://github.com/Mojang/bedrock-samples bedrock-samples
git -C bedrock-samples sparse-checkout init --cone
git -C bedrock-samples sparse-checkout set metadata/json_schemas
git -C bedrock-samples checkout -q

for d in */; do [ -d "$d/.git" ] && printf "%s %s\n" "$d" "$(git -C "$d" rev-parse HEAD)"; done
```

```sh
# Chunker: neutral model and mapping size
grep -cE '^    [A-Z][A-Z0-9_]*\(' chunker/cli/src/main/java/com/hivemc/chunker/conversion/intermediate/column/chunk/identifier/type/block/ChunkerVanillaBlockType.java   # 1292
grep -cE '^    public static final' chunker/cli/src/main/java/com/hivemc/chunker/conversion/intermediate/column/chunk/identifier/type/block/states/vanilla/VanillaBlockStates.java  # 134
ls chunker/cli/src/main/java/com/hivemc/chunker/conversion/intermediate/column/chunk/identifier/type/block/states/vanilla/types | wc -l  # 70
find chunker/cli/src/main/java -name '*BlockIdentifierResolver.java' -print0 | xargs -0 wc -l | tail -1   # 8309
find chunker/cli/src/main/java -name '*StateGroups.java' -print0 | xargs -0 wc -l | tail -1               # 2710
grep -c 'VersionedStateMappingGroup' chunker/cli/src/main/java/com/hivemc/chunker/conversion/encoding/bedrock/base/resolver/identifier/BedrockStateGroups.java  # 62
grep -oE 'registerDuplicate[A-Za-z]*' chunker/cli/src/main/java/com/hivemc/chunker/conversion/encoding/bedrock/base/resolver/identifier/BedrockBlockIdentifierResolver.java | sort | uniq -c
ls chunker/cli/data/java | wc -l; ls chunker/cli/data/bedrock | wc -l   # 51, 58

# Chunker: loss lists (script kept outside the clones, run with -I)
python3 -I /tmp/hybrid-tools/chunker_lists.py chunker   # UNSUPPORTED_BLOCKS 183, LOSSY .put 12

# Chunker: Mojang's definition field appearing and disappearing
# prints one line per version: present for every block from 1.20.5 to 26.2, zero at 26.3
python3 -I /tmp/hybrid-tools/java_definition.py chunker/cli/data/java

# Geyser mappings
python3 -I /tmp/hybrid-tools/nbt.py geyser-mappings/blocks.nbt 200   # root key bedrock_mappings
python3 -I /tmp/hybrid-tools/geyser_stats.py geyser-mappings         # 35723 entries, 3824 bedrock_identifier, 1658 items, 67 biomes
sed -n '466,472p' geyser/core/src/main/java/org/geysermc/geyser/registry/populator/BlockRegistryPopulator.java
sed -n '103,112p' geyser/core/src/main/java/org/geysermc/geyser/registry/mappings/MappingsConfigReader.java

# ViaBedrock
python3 -I -c "import json;d=json.load(open('viabedrock/src/main/resources/assets/viabedrock/data/custom/blockstate_mappings.json'));print(len(d))"  # 22091
sed -n '1,60p' viabedrock/'Update Process.md'

# PyMCTranslate
head -6 pymctranslate/LICENSE
git -C pymctranslate fetch -q --deepen=2000 && git -C pymctranslate log --format='%H %ad %s' --date=short -- LICENSE
find pymctranslate/PyMCTranslate/json -name '*.json' | wc -l   # 229296
ls pymctranslate/PyMCTranslate/json/versions/universal/block/blockstate/specification/universal_minecraft/vanilla | wc -l  # 420
cat pymctranslate/PyMCTranslate/json/versions/java_26_3/block/blockstate/to_universal/minecraft/vanilla/oak_log.json

# minecraft-data cross-edition mapping
python3 -I -c "import json;d=json.load(open('minecraft-data/data/bedrock/1.19.1/blockMappings.json'));print(len(d),d[2])"  # 22658
python3 -I /tmp/hybrid-tools/mcdata_paths.py minecraft-data   # one version references blockMappings

# Datapack support, or its absence
sed -n '3030,3036p' glowstone/src/main/java/net/glowstone/GlowServer.java
sed -n '118,152p' glowstone-redstone-transformer/data-pack/loader/src/main/java/net/glowstone/datapack/loader/DataPackLoader.java
cat minestom/src/main/java/net/minestom/server/gamedata/DataPack.java
# 1 for valence, 0 for cuberite; valence's single hit is a translation key string in
# crates/valence_lang/extracted/translation_keys.json, not datapack code
for d in valence cuberite; do grep -rli 'datapack\|pack\.mcmeta' "$d/src" "$d/crates" 2>/dev/null; done
sed -n '1,80p' mc-datapack-loader/src/DataType.ts
sed -n '26,70p' mc-datapack-loader/src/Datapack/CompositeDatapack.ts
curl -s https://raw.githubusercontent.com/PaperMC/Paper/main/paper-api/src/main/java/io/papermc/paper/datapack/Datapack.java | sed -n '14,55p'
curl -s https://raw.githubusercontent.com/FabricMC/fabric/1.21.4/fabric-resource-loader-v0/src/main/java/net/fabricmc/fabric/impl/resource/loader/ModResourcePackUtil.java | sed -n '119,166p'

# Behavior pack support
grep -rn 'format_version' addonbridge/src | head                      # one hit, PackIndex.java:119
grep -c 'case "' addonbridge/src/main/java/fr/linesia/addonbridge/ai/BehaviorMapper.java   # 21
ls addonbridge/LICENSE* nukkit-addon-bridge/LICENSE* 2>&1             # no such files
sed -n '1,60p' nukkit-addon-bridge/docs/version-fallback-strategy.md
sed -n '345,372p' endstone/src/endstone/core/server.cpp

# Schemas
git -C bedrock-samples ls-tree -r --name-only HEAD | grep -c '^metadata/json_schemas/'   # 969
python3 -I -c "import json;print(json.load(open('bedrock-samples/metadata/json_schemas/server/entity/1.26.50/ActorDocument.json')))"
git -C bedrock-samples show HEAD:LICENSE.md
find vanilla-mcdoc -name '*.mcdoc' | wc -l                            # 246
grep -n 'since=\|until=' vanilla-mcdoc/java/data/loot/mod.mcdoc | head
head -12 minecraft-schemas/README.md                                  # unmaintained notice
```

Scripts used, all kept in `/tmp/hybrid-tools/` outside every clone and run with `python3 -I`:
`nbt.py` (a 50-line gzip plus big-endian NBT reader that prints the root tag as JSON),
`chunker_lists.py` (regex-extracts `UNSUPPORTED_BLOCKS` and `LOSSY_BLOCKS` from the Bedrock
validation test and counts them), `java_definition.py` (reports whether `definition` is present in
each committed `reports/blocks.json`), `geyser_stats.py` (decodes `blocks.nbt` and counts entries and
`bedrock_identifier` keys, then counts `items.json` and `biomes.json`), and `mcdata_paths.py` (scans
`dataPaths.json` for entries referencing `blockMappings`).
