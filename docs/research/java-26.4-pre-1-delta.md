# Java 26.3 to 26.4 Pre-Release 1 data delta

Research note, 2026-11-19, re-pinned to 26.4 Pre-Release 1 on 2026-11-24. Question: what changed
in the vanilla datapack and the data generator reports between Java Edition 26.3, the release this
server runs, and 26.4 Pre-Release 1, the preview it tracks, and which of those changes the loaders
have to gate. The note was written against Snapshot 10; [Snapshot 10 to Pre-Release 1](#snapshot-10-to-pre-release-1)
lists what the pre-release changed on top of it.

## Summary

The load path moved in five places. `rule_test` became `rule_test_type` in the registry report.
The `interpolated` density function became `upscale`, which gives each axis its own cell size
and interpolation mode. `noise_settings` lost `default_block`, because the material rule now
places every solid block. The `large_dripstone` feature type became `large_speleothem`, which
names its base block so it can also build `large_icicle`. Fluids lost their `flowing_*`
registry entries, so a fluid state in a feature names `level` and `source` where it named
`falling`.

The release adds the `crevasse` feature, the `below_heightmap` block predicate, the
`domain_warp` density function and the `noise_biomes` chunk status. It adds two element
registries, `dispense_behavior` and `block_sound_set`, plus 25 blocks, 28 items and 2 entity
types, most of them for the new ice caves biome. The vanilla datapack loads strict under the preview's own format
once the gates below are in. The corpus suites in `loot`, `recipes`, `predicates`,
`advancements`, `features` and `structures` pass against it, and so does
`pnpm run bringup:java --java 26.4-pre-1`.

## Which release this is

| Key               | 26.3          | 26.4 Snapshot 10   | 26.4 Pre-Release 1 |
| ----------------- | ------------- | ------------------ | ------------------ |
| Release id        | `26.3`        | `26.4-snapshot-10` | `26.4-pre-1`       |
| Data pack format  | 121.0         | 128.0              | 128.1              |
| Data version      | 5023          | 5130               | 5131               |
| JDK               | 25            | 25                 | 25                 |
| Server jar sha1   | `33680f5f…`   | `d7135161…`        | `7ade6b7b…`        |

Every column comes from the `version.json` `datagen:java` writes beside each datapack, which
reads the jar's own `version.json`. Snapshot 10 was the newest snapshot in Mojang's piston-meta
version manifest on 2026-11-19 (`latest.snapshot`, released 2026-11-17), with sha256
`54648ab1…` and 63998326 bytes. Snapshot 8, which the plan named, had format 127.0 and data
version 5128.

The pin is now Pre-Release 1, `latest.snapshot` in the manifest on 2026-11-24 and released that
day. The java-bringup skill re-pins the preview when Mojang publishes a pre-release. The URL and
sha1 come from its version package. The sha256 (`e82d5167…`) and the size (64146748 bytes) were
measured on download.

## How the delta was derived

```sh
pnpm --filter @jsprismarine/bedrock-data run datagen:java --java 26.3
pnpm --filter @jsprismarine/bedrock-data run datagen:java --java 26.4-snapshot-10
pnpm --filter @jsprismarine/bedrock-data run java:diff 26.3 26.4-snapshot-10 --out /tmp/java-delta.md
pnpm --filter @jsprismarine/bedrock-data run datagen:java --java 26.4-pre-1
pnpm --filter @jsprismarine/bedrock-data run java:diff 26.3 26.4-pre-1 --out /tmp/java-delta.md
pnpm --filter @jsprismarine/bedrock-data run java:diff 26.4-snapshot-10 26.4-pre-1 --out /tmp/pre-1.md
```

`java:diff` compares both generated datapacks file by file and both `registries.json` and
`blocks.json` reports entry by entry, and it samples the JSON keys of every file in each
registry directory. Each key it reported was then read in the real files of both releases to
tell a rename from a new field. The note was cross-checked against the Minecraft Wiki's
[Java Edition 26.4](https://minecraft.wiki/w/Java_Edition_26.4) page, which aggregates the
snapshot changelogs. Mojang's snapshot articles on minecraft.net did not load from this host
during the research. The wiki and the generated data agree everywhere they overlap.

One report is new and not deterministic: `loot_context_requirements.json` lists each context
set's parameters in hash order, which changes from run to run. `datagen:java` sorts its arrays,
so two runs are byte-identical, 11979 files.

The `java:diff` output from 26.3 to Pre-Release 1 is the output from 26.3 to Snapshot 10 with the
version row changed, so the sections below hold for both.

## Renamed and moved directories

None renamed or removed under `data/minecraft/`. Four directories are new:

| Directory                | Registry                              | Read by                   |
| ------------------------ | ------------------------------------- | ------------------------- |
| `dispense_behavior/`     | `minecraft:dispense_behavior`, 27 files | nothing yet (#3286)     |
| `block_sound_set/`       | `minecraft:block_sound_set`, 138 files  | nothing yet (#3286)     |
| `tags/block_sound_set/`  | tags of the above                     | loaded as tags            |
| `tags/block/pathfinding/`| block tags mobs path through          | loaded as tags            |

The registry report renamed one registry: `minecraft:rule_test` is `minecraft:rule_test_type`
from format 128. Its ten entries did not change. `.test/javaRegistries.ts` reads it under the
name the reports' release uses (`SINCE_RULE_TEST_TYPE_REGISTRY`). It also added
`minecraft:command_suggestion_type` and `minecraft:dispense_behavior_type`.

## Grammar changes

| Registry directory           | Change                                                                                                                                 | Kind                         | Owner     |
| ---------------------------- | -------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------- | --------- |
| `worldgen/density_function`  | `interpolated` with `cell_size_xz` and `cell_size_y` became `upscale` with `x`, `y`, `z`, each `{ cell_size, mode }`, in 13 files       | rename, with a new field     | worldgen  |
| `worldgen/noise_settings`    | `default_block` removed from all 7 files; the overworld, caves and floating islands material rules end in `{ "type": "block", "result_state": "minecraft:stone" }` | removal | worldgen |
| `worldgen/feature`           | `large_dripstone` type became `large_speleothem` with a required `base_block`; new `large_icicle` uses it with `packed_ice`              | rename, with a new field     | features  |
| `worldgen/feature`           | fluid states under `state.properties` name `level` and `source` where they named `falling` (6 spring features)                         | rename                       | features  |
| `worldgen/feature`           | 13 new `ice_cave_ore_*` sequences carry inline `ore` features, so `features[].feature.size`, `targets` and `discard_chance_on_air_exposure` appear | new files, existing grammar | features  |
| `worldgen/placed_feature`    | `target_condition.blocks` appears in one new placement                                                                                 | existing optional field      | features  |
| `block_transformer`          | `consume_on_use` in one file                                                                                                           | new optional field           | none yet  |
| `dimension_type`             | `attributes.minecraft:visual/has_sky_occluder` in 2 files                                                                              | new environment attribute    | none yet  |
| `sulfur_cube_archetype`      | `location_based_effects` in one file                                                                                                   | new optional field           | none yet  |
| `advancement`                | new criteria for the new blocks, the ice caves biome and the frostbite                                                                 | content, not grammar         | -         |

The fluid state rename needs no gate: the feature readers take a fluid state's name and place
that fluid as a source, whatever its properties say. The ore and `target_condition` rows are new
files in the 26.3 grammar.

## New registry entries

| Registry                                   | Added                                                                           | Removed                          | Handling                                     |
| ------------------------------------------ | ------------------------------------------------------------------------------- | -------------------------------- | -------------------------------------------- |
| `minecraft:worldgen/feature_type`          | `crevasse`, `large_speleothem`                                                  | `large_dripstone`                | `large_speleothem` read; `crevasse` deferred (#3279) |
| `minecraft:worldgen/density_function_type` | `upscale`, `domain_warp`                                                        | `interpolated`                   | `upscale` read; `domain_warp` deferred (#3280) |
| `minecraft:block_predicate_type`           | `below_heightmap`                                                               |                                  | read                                         |
| `minecraft:chunk_status`                   | `noise_biomes`                                                                  |                                  | deferred (#3281)                             |
| `minecraft:dispense_behavior_type`         | 24 types, `brush_armadillo` to `transform_block`                                |                                  | deferred (#3286)                             |
| `minecraft:command_argument_type`          | `bool`, `double`, `float`, `integer`, `long`, `word`, `quoted_string`, `greedy_string`, `pattern` under `minecraft:` | `brigadier:*`, `resource_key`, `resource_or_tag_key` | the command tree builds; no reader keys on these ids |
| `minecraft:command_suggestion_type`        | `ask_server`, `available_sounds`, `literal`, `post_effects`, `summonable_entities` |                               | not read                                     |
| `minecraft:context_key_set`                | `command_modifier`, `command_predicate`                                         | `command`                        | the predicate corpus passes                  |
| `minecraft:data_component_type`            | `dispense_behavior`                                                             |                                  | not read (#3286)                             |
| `minecraft:fluid`                          |                                                                                 | `flowing_water`, `flowing_lava`  | see the fluid state rename                   |
| `minecraft:mob_effect`, `minecraft:potion` | `freezing`; potions `freezing`, `long_freezing`                                 |                                  | content                                      |
| `minecraft:particle_type`                  | `freezing`                                                                      | `item_snowball`                  | content                                      |
| `minecraft:environment_attribute`          | `visual/has_sky_occluder`                                                       |                                  | content                                      |
| `minecraft:menu`                           | `jukebox`                                                                       |                                  | content                                      |
| `minecraft:sound_event`                    | 60 sounds for the new blocks, ice, packed ice, frostbite, ice ball and `music_disc.flurry` | `intentionally_empty` | content                                    |

`unhandledJavaTypes.test.ts` in `features`, `worldgen` and `chunkgen` names every deferred
entry, with the format it first appears at, so the default release's report does not expect it.

## Blocks, items and entity types

25 blocks are new, each with a block item:

| Block                                            | States | Note                                   |
| ------------------------------------------------ | -----: | -------------------------------------- |
| `brittle_ice`                                    |      4 | the crevasse feature's surface block   |
| `ice_crystal`                                    |     12 | Bedrock 2225 already has this block    |
| `icicle`                                         |     40 | Bedrock 2225 already has this block    |
| `chiseled_packed_ice`, `chiseled_soulshale`      |      1 |                                        |
| `packed_ice_bricks`, `snow_bricks`               |      1 |                                        |
| `polished_calcite`, `polished_calcite_bricks`    |      1 |                                        |
| `calcite_pillar`                                 |      3 |                                        |
| 5 slabs (`calcite`, `packed_ice_brick`, `polished_calcite`, `polished_calcite_brick`, `snow_brick`) | 6 each |   |
| 5 stairs, the same five materials                |     80 |                                        |
| 5 walls, the same five materials                 |    324 |                                        |

`jukebox` went from 2 states to 4. Three items have no block: `frostbite_spawn_egg`, `ice_ball`
and `music_disc_flurry`. The new entity types are `frostbite`, a zombie variant, and `ice_ball`,
its projectile.

Whether each has a Bedrock counterpart in the paired preview, protocol 2259, is undecided: the
mapping tables for the pair need 2259's block palette, which has not been captured (#3283).

Status, 2026-11-20: 2259's palette is captured, and every block, item and entity type above has a
2259 counterpart of the same name. The preview's mapping and item type tables exist (#3283).

## What the gates are

| Package     | Constant                              | Compared against                    | Test                                         |
| ----------- | ------------------------------------- | ----------------------------------- | -------------------------------------------- |
| worldgen    | `SINCE_UPSCALE_DENSITY_FUNCTION = 128` | the target's data pack format major | `src/density/upscale.test.ts`               |
| worldgen    | `SINCE_MATERIAL_RULE_PLACES_SOLID = 128` | the same                          | `src/settings/defaultBlock.test.ts`          |
| test helper | `SINCE_RULE_TEST_TYPE_REGISTRY = 128`  | the reports' release format        | the `unhandledJavaTypes.test.ts` suites      |

The worldgen parsers take the format through `WorldgenDataSource.format`, and the server passes
its content target's format through `JavaWorldgenRegistries` and the worker registry bundle.
`upscale` maps onto the `interpolated` node when every axis is `interpolate_linear` and x and z
share a cell size, which is every vanilla use. From format 128 on, solid density fills with
stone, which the surface pass replaces through the material rule; every vanilla rule tree ends
in an unconditional block, so the output matches. `large_speleothem` and `below_heightmap` are
new type ids rather than two spellings of one key, so they need no gate.

## Verified but not implemented

- `crevasse` feature type: #3279. The 26.4 `large_speleothem` reuses the 26.3 `large_dripstone`
  transcription with its base block as a parameter, and has not been re-read against 26.4
  bytecode.
- `domain_warp` and the four non-linear `upscale` modes: #3280.
- `noise_biomes` chunk status: #3281.
- A 26.4 material rule that leaves a solid block unplaced leaves air in Java and stone here: #3282.
- The 2259 block palette, and so the preview pair's mapping and item type tables: #3283. Done
  2026-11-20.
- Worldgen, feature and item behavior vectors for the preview: #3284. The worldgen oracle does not
  compile against 26.4 (`RandomState.create`, the `NoiseChunk` constructor and
  `NoiseGeneratorSettings.defaultBlock` changed).
- `dispense_behavior` and `block_sound_set` element registries: #3286.

Status, 2026-11-24: `crevasse` (#3279), `noise_biomes` (#3281), the material rule that places
nothing (#3282) and the two element registries (#3286) are read. Reading the 26.4 bytecode for them
found one more change: `Mth.sin` and `Mth.cos` round the scaled angle to the nearest table entry
where 26.3 truncated, mirror a negative angle, and hold exactly 0, 1, 0 and -1 at the quarter
turns. Carvers and the features that call them use the 26.4 lookup from format 128 on
(`SINCE_ROUNDED_MTH_TRIG`).

The Java goldens dumper compiles against 26.4 after two fixes. It reads the `MinecraftServer` and
`ServerLevel` constructors with `javap`, and it reads a block's sound by reflection, because
26.4 replaced `SoundType` with the `block_sound_set` registry. A 26.4 golden's `soundType` is the
set's id, such as `minecraft:stone`, or `none` for water, lava and the bubble column.

## Snapshot 10 to Pre-Release 1

`java:diff 26.4-snapshot-10 26.4-pre-1` reports no added, removed or renamed directory, registry,
registry entry, JSON key, block, item or entity type. The data generator reports are
byte-identical. A file-by-file comparison of the two datapacks finds these changes:

| What                                                      | Change                                                                                              | Effect here                                       |
| --------------------------------------------------------- | --------------------------------------------------------------------------------------------------- | ------------------------------------------------- |
| `pack.mcmeta`, `version.json`                             | format 128.0 to 128.1, data version 5130 to 5131                                                    | a minor format bump, so no gate                   |
| `datapacks/{minecart_improvements,redstone_experiments,trade_rebalance}/pack.mcmeta` | `min_format` 128 became `[128, 1]`                                                 | loads as before                                   |
| `dispense_behavior/carved_pumpkin.json`, `glowstone.json` | `equip_sulfur_cube` added before the fallback, fixing MC-312832                                     | none: dispense behaviors are loaded, not run      |
| structure templates, 1511 files                           | the `DataVersion` each NBT file records                                                             | none                                              |
| `en_us.json`                                              | 2 chat restriction strings added, 4 subtitles reworded                                              | none                                              |

The wiki's changelog lists two changes that do not show up in a file comparison:

- The `minecraft:tooltip_display` data component has a new optional `split_lines` boolean,
  default `true`, which lets an item opt out of the new tooltip line wrapping. The items
  package's `tooltip_display` schema drops keys it does not name, so a component that sets it
  still loads. No vanilla file sets it, and Bedrock has no tooltip wrapping setting to map it onto.
- `upscale` now upscales along X, then Z, then Y, where Snapshot 10 went Z, X, Y. In the bytecode,
  `PolymorphicUpscaler` and `UpscaleFunction$Sampler` swap their X and Z loops and passes. The
  worldgen reader maps every vanilla `upscale`, which is linear on all three axes, onto the 26.3
  `interpolated` node, so its output does not change. The non-linear modes that would follow
  Pre-Release 1's order are still unread (#3280), and the vectors that would compare float results
  with Java's are still missing (#3284).

Regenerating the derived data for Pre-Release 1 gives the same mapping tables, item type table,
block properties, entity attributes and navigation as Snapshot 10, apart from the release name. The
goal capture differs: `minecraft:camel` and `minecraft:camel_husk` have no goals. Both jars'
`Camel.registerGoals` is empty. The Snapshot 10 capture predates the goal reader fix that stopped
crediting a mob with its ancestor's goals (8b4dfcdb, #3657), and Pre-Release 1's is the first
preview capture taken after it.

## Transcriptions to re-read

Written by `pnpm run bringup:java --java 26.4-pre-1`, which fingerprints every member a
`@javaSource` tag names in the 26.3 and 26.4-pre-1 jars.

| Tagged members | Changed | Gone or moved | Unchanged |
| -------------- | ------- | ------------- | --------- |
| 672 | 84 | 8 | 580 |

Read each change against the code that tags it, fix the copy where Java changed, and
restamp with `java:sources --update --java 26.4-pre-1 --reviewed <spelling>`. The
`java.transcriptions` parity family reports the unread ones as deferred until 26.4-pre-1 is the
default.

### Changed

#### `AbstractArrow.tick`

Tagged at `packages/prismarine/src/entity/data/projectileFlight.ts:21`.

```diff
    invokevirtual net/minecraft/world/entity/projectile/arrow/AbstractArrow.setDeltaMovement (Lnet/minecraft/world/phys/Vec3;)V
    return
- inlined net/minecraft/world/entity/projectile/arrow/AbstractArrow.addBubbleParticles(Lnet/minecraft/world/phys/Vec3;)V
-   aload_0
-   invokevirtual net/minecraft/world/entity/projectile/arrow/AbstractArrow.getDeltaMovement ()Lnet/minecraft/world/phys/Vec3;
-   astore_2
-   iconst_0
-   istore_3
-   iload_3
-   iconst_4
-   if_icmpge L43
-   ldc float 0.25
-   fstore 4
-   aload_0
-   invokevirtual net/minecraft/world/entity/projectile/arrow/AbstractArrow.level ()Lnet/minecraft/world/level/Level;
-   getstatic net/minecraft/core/particles/ParticleTypes.BUBBLE Lnet/minecraft/core/particles/SimpleParticleType;
-   aload_1
-   getfield net/minecraft/world/phys/Vec3.x D
-   aload_2
-   getfield net/minecraft/world/phys/Vec3.x D
-   ldc2_w double 0.25
-   dmul
-   dsub
-   aload_1
-   getfield net/minecraft/world/phys/Vec3.y D
-   aload_2
-   getfield net/minecraft/world/phys/Vec3.y D
-   ldc2_w double 0.25
-   dmul
-   dsub
-   aload_1
-   getfield net/minecraft/world/phys/Vec3.z D
-   aload_2
-   getfield net/minecraft/world/phys/Vec3.z D
-   ldc2_w double 0.25
-   dmul
-   dsub
-   aload_2
-   getfield net/minecraft/world/phys/Vec3.x D
-   aload_2
-   getfield net/minecraft/world/phys/Vec3.y D
-   aload_2
-   getfield net/minecraft/world/phys/Vec3.z D
-   invokevirtual net/minecraft/world/level/Level.addParticle (Lnet/minecraft/core/particles/ParticleOptions;DDDDDD)V
-   iinc 3 1
-   goto L5
-   return
  inlined net/minecraft/world/entity/projectile/arrow/AbstractArrow.stepMoveAndHit(Lnet/minecraft/world/phys/BlockHitResult;)V
    aload_0
```

#### `AbstractHorse.handleEating`

Tagged at `packages/prismarine/src/entity/javaBabyFood.ts:24`.

```diff
    invokevirtual net/minecraft/world/entity/animal/equine/AbstractHorse.setInLove (Lnet/minecraft/world/entity/player/Player;)V
    aload_0
-   invokevirtual net/minecraft/world/entity/animal/equine/AbstractHorse.getHealth ()F
-   aload_0
-   invokevirtual net/minecraft/world/entity/animal/equine/AbstractHorse.getMaxHealth ()F
-   fcmpg
-   ifge L148
+   invokevirtual net/minecraft/world/entity/animal/equine/AbstractHorse.canHealNaturally ()Z
+   ifeq L145
    fload 4
    fconst_0
    fcmpl
-   ifle L148
+   ifle L145
    aload_0
    fload 4
-   invokevirtual net/minecraft/world/entity/animal/equine/AbstractHorse.heal (F)V
+   invokevirtual net/minecraft/world/entity/animal/equine/AbstractHorse.healNaturally (F)V
    iconst_1
    istore_3
    aload_0
    invokevirtual net/minecraft/world/entity/animal/equine/AbstractHorse.isBaby ()Z
-   ifeq L182
+   ifeq L179
    iload 5
-   ifle L182
+   ifle L179
    aload_0
    invokevirtual net/minecraft/world/entity/animal/equine/AbstractHorse.isAgeLocked ()Z
-   ifne L182
+   ifne L179
    aload_0
    invokevirtual net/minecraft/world/entity/animal/equine/AbstractHorse.level ()Lnet/minecraft/world/level/Level;
…
    invokevirtual net/minecraft/world/entity/animal/equine/AbstractHorse.level ()Lnet/minecraft/world/level/Level;
    invokevirtual net/minecraft/world/level/Level.isClientSide ()Z
-   ifne L182
+   ifne L179
    aload_0
    iload 5
…
    istore_3
    iload 6
-   ifle L204
+   ifle L201
    iload_3
-   ifne L189
+   ifne L186
    aload_0
    invokevirtual net/minecraft/world/entity/animal/equine/AbstractHorse.isTamed ()Z
-   ifne L204
+   ifne L201
    aload_0
    invokevirtual net/minecraft/world/entity/animal/equine/AbstractHorse.getTemper ()I
    aload_0
    invokevirtual net/minecraft/world/entity/animal/equine/AbstractHorse.getMaxTemper ()I
-   if_icmpge L204
+   if_icmpge L201
    aload_0
    invokevirtual net/minecraft/world/entity/animal/equine/AbstractHorse.level ()Lnet/minecraft/world/level/Level;
```

12 more lines. `java:sources --list 'AbstractHorse.handleEating'` prints the listing under each `--java`.

#### `AbstractHurtingProjectile.tick`

Tagged at `packages/prismarine/src/entity/data/projectileFlight.ts:46`.

```diff
    aload_0
    invokevirtual net/minecraft/world/entity/projectile/hurtingprojectile/AbstractHurtingProjectile.isInWater ()Z
-   ifeq L53
-   iconst_0
-   istore 4
-   iload 4
-   iconst_4
-   if_icmpge L49
-   ldc float 0.25
-   fstore 5
+   ifeq L16
    aload_0
-   invokevirtual net/minecraft/world/entity/projectile/hurtingprojectile/AbstractHurtingProjectile.level ()Lnet/minecraft/world/level/Level;
-   getstatic net/minecraft/core/particles/ParticleTypes.BUBBLE Lnet/minecraft/core/particles/SimpleParticleType;
    aload_2
-   getfield net/minecraft/world/phys/Vec3.x D
-   aload_1
-   getfield net/minecraft/world/phys/Vec3.x D
-   ldc2_w double 0.25
-   dmul
-   dsub
-   aload_2
-   getfield net/minecraft/world/phys/Vec3.y D
-   aload_1
-   getfield net/minecraft/world/phys/Vec3.y D
-   ldc2_w double 0.25
-   dmul
-   dsub
-   aload_2
-   getfield net/minecraft/world/phys/Vec3.z D
-   aload_1
-   getfield net/minecraft/world/phys/Vec3.z D
-   ldc2_w double 0.25
-   dmul
-   dsub
-   aload_1
-   getfield net/minecraft/world/phys/Vec3.x D
-   aload_1
-   getfield net/minecraft/world/phys/Vec3.y D
-   aload_1
-   getfield net/minecraft/world/phys/Vec3.z D
-   invokevirtual net/minecraft/world/level/Level.addParticle (Lnet/minecraft/core/particles/ParticleOptions;DDDDDD)V
-   iinc 4 1
-   goto L11
+   invokevirtual net/minecraft/world/entity/projectile/hurtingprojectile/AbstractHurtingProjectile.addBubbleParticles (Lnet/minecraft/world/phys/Vec3;)V
    aload_0
    invokevirtual net/minecraft/world/entity/projectile/hurtingprojectile/AbstractHurtingProjectile.getLiquidInertia ()F
    fstore_3
-   goto L56
+   goto L19
    aload_0
    invokevirtual net/minecraft/world/entity/projectile/hurtingprojectile/AbstractHurtingProjectile.getInertia ()F
```

#### `BaseCoralPlantTypeBlock.getStateForPlacement`

Tagged at `packages/block-behaviors/src/rules/javaPlacement.ts:384`.

```diff
  method net/minecraft/world/level/block/BaseCoralPlantTypeBlock.getStateForPlacement(Lnet/minecraft/world/item/context/BlockPlaceContext;)Lnet/minecraft/world/level/block/state/BlockState;
    aload_1
-   invokevirtual net/minecraft/world/item/context/BlockPlaceContext.getLevel ()Lnet/minecraft/world/level/Level;
-   aload_1
-   invokevirtual net/minecraft/world/item/context/BlockPlaceContext.getClickedPos ()Lnet/minecraft/core/BlockPos;
-   invokevirtual net/minecraft/world/level/Level.getFluidState (Lnet/minecraft/core/BlockPos;)Lnet/minecraft/world/level/material/FluidState;
+   invokevirtual net/minecraft/world/item/context/BlockPlaceContext.getClickedFluidState ()Lnet/minecraft/world/level/material/FluidState;
    astore_2
    aload_0
…
    getstatic net/minecraft/tags/FluidTags.WATER Lnet/minecraft/tags/TagKey;
    invokevirtual net/minecraft/world/level/material/FluidState.is (Lnet/minecraft/tags/TagKey;)Z
-   ifeq L18
+   ifeq L15
    aload_2
    invokevirtual net/minecraft/world/level/material/FluidState.isFull ()Z
-   ifeq L18
+   ifeq L15
    iconst_1
-   goto L19
+   goto L16
    iconst_0
    invokestatic java/lang/Boolean.valueOf (Z)Ljava/lang/Boolean;
```

#### `BigDripleafBlock.getStateForPlacement`

Tagged at `packages/block-behaviors/src/rules/javaPlacement.ts:352`.

```diff
    astore_2
    aload_1
-   invokevirtual net/minecraft/world/item/context/BlockPlaceContext.getLevel ()Lnet/minecraft/world/level/Level;
-   aload_1
-   invokevirtual net/minecraft/world/item/context/BlockPlaceContext.getClickedPos ()Lnet/minecraft/core/BlockPos;
-   invokevirtual net/minecraft/world/level/Level.getFluidState (Lnet/minecraft/core/BlockPos;)Lnet/minecraft/world/level/material/FluidState;
+   invokevirtual net/minecraft/world/item/context/BlockPlaceContext.getClickedFluidState ()Lnet/minecraft/world/level/material/FluidState;
    astore_3
    aload_2
    getstatic net/minecraft/world/level/block/Blocks.BIG_DRIPLEAF Lnet/minecraft/world/level/block/Block;
    invokevirtual net/minecraft/world/level/block/state/BlockState.is (Ljava/lang/Object;)Z
-   ifne L21
+   ifne L18
    aload_2
    getstatic net/minecraft/world/level/block/Blocks.BIG_DRIPLEAF_STEM Lnet/minecraft/world/level/block/Block;
    invokevirtual net/minecraft/world/level/block/state/BlockState.is (Ljava/lang/Object;)Z
-   ifeq L23
+   ifeq L20
    iconst_1
-   goto L24
+   goto L21
    iconst_0
    istore 4
…
    getstatic net/minecraft/world/level/block/BigDripleafBlock.FACING Lnet/minecraft/world/level/block/state/properties/EnumProperty;
    iload 4
-   ifeq L42
+   ifeq L39
    aload_2
    getstatic net/minecraft/world/level/block/BigDripleafBlock.FACING Lnet/minecraft/world/level/block/state/properties/EnumProperty;
    invokevirtual net/minecraft/world/level/block/state/BlockState.getValue (Lnet/minecraft/world/level/block/state/properties/Property;)Ljava/lang/Comparable;
    checkcast net/minecraft/core/Direction
-   goto L45
+   goto L42
    aload_1
    invokevirtual net/minecraft/world/item/context/BlockPlaceContext.getHorizontalDirection ()Lnet/minecraft/core/Direction;
```

#### `BiomeTags.WATER_ON_MAP_OUTLINES`

Tagged at `packages/prismarine/src/world/World.ts:214`.

```diff
    invokestatic net/minecraft/tags/BiomeTags.create (Ljava/lang/String;)Lnet/minecraft/tags/TagKey;
    putstatic net/minecraft/tags/BiomeTags.IS_SAVANNA Lnet/minecraft/tags/TagKey;
+   ldc string "is_cave"
+   invokestatic net/minecraft/tags/BiomeTags.create (Ljava/lang/String;)Lnet/minecraft/tags/TagKey;
+   putstatic net/minecraft/tags/BiomeTags.IS_CAVE Lnet/minecraft/tags/TagKey;
    ldc string "is_overworld"
    invokestatic net/minecraft/tags/BiomeTags.create (Ljava/lang/String;)Lnet/minecraft/tags/TagKey;
…
    invokestatic net/minecraft/tags/BiomeTags.create (Ljava/lang/String;)Lnet/minecraft/tags/TagKey;
    putstatic net/minecraft/tags/BiomeTags.PRODUCES_CORALS_FROM_BONEMEAL Lnet/minecraft/tags/TagKey;
+   ldc string "generated_in_below_zero_retrogen"
+   invokestatic net/minecraft/tags/BiomeTags.create (Ljava/lang/String;)Lnet/minecraft/tags/TagKey;
+   putstatic net/minecraft/tags/BiomeTags.GENERATED_IN_BELOW_ZERO_RETROGEN Lnet/minecraft/tags/TagKey;
    ldc string "without_zombie_sieges"
    invokestatic net/minecraft/tags/BiomeTags.create (Ljava/lang/String;)Lnet/minecraft/tags/TagKey;
…
    invokestatic net/minecraft/tags/BiomeTags.create (Ljava/lang/String;)Lnet/minecraft/tags/TagKey;
    putstatic net/minecraft/tags/BiomeTags.SPAWNS_CORAL_VARIANT_ZOMBIE_NAUTILUS Lnet/minecraft/tags/TagKey;
+   ldc string "spawns_cold_variants_underground"
+   invokestatic net/minecraft/tags/BiomeTags.create (Ljava/lang/String;)Lnet/minecraft/tags/TagKey;
+   putstatic net/minecraft/tags/BiomeTags.SPAWNS_COLD_VARIANTS_UNDERGROUND Lnet/minecraft/tags/TagKey;
    return
  inlined net/minecraft/tags/BiomeTags.create(Ljava/lang/String;)Lnet/minecraft/tags/TagKey;
```

#### `BlockPos.rotate`

Tagged at `packages/prismarine/src/world/generators/datadriven/javaStructureEndCity.ts:62`, `packages/prismarine/src/world/generators/datadriven/javaStructureMansion.ts:1164`.

```diff
  method net/minecraft/core/BlockPos.rotate(Lnet/minecraft/world/level/block/Rotation;)Lnet/minecraft/core/BlockPos;
-   getstatic net/minecraft/core/BlockPos$8.$SwitchMap$net$minecraft$world$level$block$Rotation [I
+   getstatic net/minecraft/core/BlockPos$9.$SwitchMap$net$minecraft$world$level$block$Rotation [I
    aload_1
    invokevirtual net/minecraft/world/level/block/Rotation.ordinal ()I
```

#### `BlockPos.spiralAround`

Tagged at `packages/block-behaviors/src/geometry.ts:101`.

```diff
    areturn
  inlined net/minecraft/core/BlockPos.lambda#0(Lnet/minecraft/core/Direction;Lnet/minecraft/core/Direction;Lnet/minecraft/core/BlockPos;I)Ljava/util/Iterator;
-   new net/minecraft/core/BlockPos$6
+   new net/minecraft/core/BlockPos$7
    dup
    aload_0
…
    aload_2
    iload_3
-   invokespecial net/minecraft/core/BlockPos$6.<init> (Lnet/minecraft/core/Direction;Lnet/minecraft/core/Direction;Lnet/minecraft/core/BlockPos;I)V
+   invokespecial net/minecraft/core/BlockPos$7.<init> (Lnet/minecraft/core/Direction;Lnet/minecraft/core/Direction;Lnet/minecraft/core/BlockPos;I)V
    areturn
```

#### `Blocks.SNOW`

Tagged at `packages/prismarine/src/entity/data/EntityRuntime.ts:9026`.

```diff
    ldc float 0.6000000238418579
    invokevirtual net/minecraft/world/level/block/state/BlockBehaviour$Properties.strength (F)Lnet/minecraft/world/level/block/state/BlockBehaviour$Properties;
-   getstatic net/minecraft/world/level/block/SoundType.GRASS Lnet/minecraft/world/level/block/SoundType;
-   invokevirtual net/minecraft/world/level/block/state/BlockBehaviour$Properties.sound (Lnet/minecraft/world/level/block/SoundType;)Lnet/minecraft/world/level/block/state/BlockBehaviour$Properties;
+   getstatic net/minecraft/world/level/block/sounds/BlockSoundSets.GRASS Lnet/minecraft/resources/ResourceKey;
+   invokevirtual net/minecraft/world/level/block/state/BlockBehaviour$Properties.sound (Lnet/minecraft/resources/ResourceKey;)Lnet/minecraft/world/level/block/state/BlockBehaviour$Properties;
    invokestatic net/minecraft/world/level/block/Blocks.register (Lnet/minecraft/references/BlockItemId;Ljava/util/function/Function;Lnet/minecraft/world/level/block/state/BlockBehaviour$Properties;)Lnet/minecraft/world/level/block/Block;
    putstatic net/minecraft/world/level/block/Blocks.GRASS_BLOCK Lnet/minecraft/world/level/block/Block;
…
    ldc float 0.5
    invokevirtual net/minecraft/world/level/block/state/BlockBehaviour$Properties.strength (F)Lnet/minecraft/world/level/block/state/BlockBehaviour$Properties;
-   getstatic net/minecraft/world/level/block/SoundType.GRAVEL Lnet/minecraft/world/level/block/SoundType;
-   invokevirtual net/minecraft/world/level/block/state/BlockBehaviour$Properties.sound (Lnet/minecraft/world/level/block/SoundType;)Lnet/minecraft/world/level/block/state/BlockBehaviour$Properties;
+   getstatic net/minecraft/world/level/block/sounds/BlockSoundSets.GRAVEL Lnet/minecraft/resources/ResourceKey;
+   invokevirtual net/minecraft/world/level/block/state/BlockBehaviour$Properties.sound (Lnet/minecraft/resources/ResourceKey;)Lnet/minecraft/world/level/block/state/BlockBehaviour$Properties;
    invokestatic net/minecraft/world/level/block/Blocks.register (Lnet/minecraft/references/BlockItemId;Lnet/minecraft/world/level/block/state/BlockBehaviour$Properties;)Lnet/minecraft/world/level/block/Block;
    putstatic net/minecraft/world/level/block/Blocks.DIRT Lnet/minecraft/world/level/block/Block;
…
    ldc float 0.5
    invokevirtual net/minecraft/world/level/block/state/BlockBehaviour$Properties.strength (F)Lnet/minecraft/world/level/block/state/BlockBehaviour$Properties;
-   getstatic net/minecraft/world/level/block/SoundType.GRAVEL Lnet/minecraft/world/level/block/SoundType;
-   invokevirtual net/minecraft/world/level/block/state/BlockBehaviour$Properties.sound (Lnet/minecraft/world/level/block/SoundType;)Lnet/minecraft/world/level/block/state/BlockBehaviour$Properties;
+   getstatic net/minecraft/world/level/block/sounds/BlockSoundSets.GRAVEL Lnet/minecraft/resources/ResourceKey;
+   invokevirtual net/minecraft/world/level/block/state/BlockBehaviour$Properties.sound (Lnet/minecraft/resources/ResourceKey;)Lnet/minecraft/world/level/block/state/BlockBehaviour$Properties;
    invokestatic net/minecraft/world/level/block/Blocks.register (Lnet/minecraft/references/BlockItemId;Lnet/minecraft/world/level/block/state/BlockBehaviour$Properties;)Lnet/minecraft/world/level/block/Block;
    putstatic net/minecraft/world/level/block/Blocks.COARSE_DIRT Lnet/minecraft/world/level/block/Block;
…
    ldc float 0.5
    invokevirtual net/minecraft/world/level/block/state/BlockBehaviour$Properties.strength (F)Lnet/minecraft/world/level/block/state/BlockBehaviour$Properties;
-   getstatic net/minecraft/world/level/block/SoundType.GRAVEL Lnet/minecraft/world/level/block/SoundType;
-   invokevirtual net/minecraft/world/level/block/state/BlockBehaviour$Properties.sound (Lnet/minecraft/world/level/block/SoundType;)Lnet/minecraft/world/level/block/state/BlockBehaviour$Properties;
+   getstatic net/minecraft/world/level/block/sounds/BlockSoundSets.GRAVEL Lnet/minecraft/resources/ResourceKey;
+   invokevirtual net/minecraft/world/level/block/state/BlockBehaviour$Properties.sound (Lnet/minecraft/resources/ResourceKey;)Lnet/minecraft/world/level/block/state/BlockBehaviour$Properties;
    invokestatic net/minecraft/world/level/block/Blocks.register (Lnet/minecraft/references/BlockItemId;Ljava/util/function/Function;Lnet/minecraft/world/level/block/state/BlockBehaviour$Properties;)Lnet/minecraft/world/level/block/Block;
    putstatic net/minecraft/world/level/block/Blocks.PODZOL Lnet/minecraft/world/level/block/Block;
…
    ldc float 3
    invokevirtual net/minecraft/world/level/block/state/BlockBehaviour$Properties.strength (FF)Lnet/minecraft/world/level/block/state/BlockBehaviour$Properties;
-   getstatic net/minecraft/world/level/block/SoundType.WOOD Lnet/minecraft/world/level/block/SoundType;
-   invokevirtual net/minecraft/world/level/block/state/BlockBehaviour$Properties.sound (Lnet/minecraft/world/level/block/SoundType;)Lnet/minecraft/world/level/block/state/BlockBehaviour$Properties;
+   getstatic net/minecraft/world/level/block/sounds/BlockSoundSets.WOOD Lnet/minecraft/resources/ResourceKey;
+   invokevirtual net/minecraft/world/level/block/state/BlockBehaviour$Properties.sound (Lnet/minecraft/resources/ResourceKey;)Lnet/minecraft/world/level/block/state/BlockBehaviour$Properties;
    invokevirtual net/minecraft/world/level/block/state/BlockBehaviour$Properties.ignitedByLava ()Lnet/minecraft/world/level/block/state/BlockBehaviour$Properties;
    invokestatic net/minecraft/world/level/block/Blocks.register (Lnet/minecraft/references/BlockItemId;Lnet/minecraft/world/level/block/state/BlockBehaviour$Properties;)Lnet/minecraft/world/level/block/Block;
…
    ldc float 3
    invokevirtual net/minecraft/world/level/block/state/BlockBehaviour$Properties.strength (FF)Lnet/minecraft/world/level/block/state/BlockBehaviour$Properties;
-   getstatic net/minecraft/world/level/block/SoundType.WOOD Lnet/minecraft/world/level/block/SoundType;
-   invokevirtual net/minecraft/world/level/block/state/BlockBehaviour$Properties.sound (Lnet/minecraft/world/level/block/SoundType;)Lnet/minecraft/world/level/block/state/BlockBehaviour$Properties;
+   getstatic net/minecraft/world/level/block/sounds/BlockSoundSets.WOOD Lnet/minecraft/resources/ResourceKey;
+   invokevirtual net/minecraft/world/level/block/state/BlockBehaviour$Properties.sound (Lnet/minecraft/resources/ResourceKey;)Lnet/minecraft/world/level/block/state/BlockBehaviour$Properties;
    invokevirtual net/minecraft/world/level/block/state/BlockBehaviour$Properties.ignitedByLava ()Lnet/minecraft/world/level/block/state/BlockBehaviour$Properties;
    invokestatic net/minecraft/world/level/block/Blocks.register (Lnet/minecraft/references/BlockItemId;Lnet/minecraft/world/level/block/state/BlockBehaviour$Properties;)Lnet/minecraft/world/level/block/Block;
…
    ldc float 3
    invokevirtual net/minecraft/world/level/block/state/BlockBehaviour$Properties.strength (FF)Lnet/minecraft/world/level/block/state/BlockBehaviour$Properties;
-   getstatic net/minecraft/world/level/block/SoundType.WOOD Lnet/minecraft/world/level/block/SoundType;
-   invokevirtual net/minecraft/world/level/block/state/BlockBehaviour$Properties.sound (Lnet/minecraft/world/level/block/SoundType;)Lnet/minecraft/world/level/block/state/BlockBehaviour$Properties;
+   getstatic net/minecraft/world/level/block/sounds/BlockSoundSets.WOOD Lnet/minecraft/resources/ResourceKey;
+   invokevirtual net/minecraft/world/level/block/state/BlockBehaviour$Properties.sound (Lnet/minecraft/resources/ResourceKey;)Lnet/minecraft/world/level/block/state/BlockBehaviour$Properties;
```

8360 more lines. `java:sources --list 'Blocks.SNOW'` prints the listing under each `--java`.

#### `BlockTags.DOORS`

Tagged at `packages/prismarine/src/entity/data/poi.ts:85`.

```diff
    invokevirtual net/minecraft/tags/BlockItemTagId.block ()Lnet/minecraft/tags/TagKey;
    putstatic net/minecraft/tags/BlockTags.COPPER_CHESTS Lnet/minecraft/tags/TagKey;
+   getstatic net/minecraft/tags/BlockItemTags.JUKEBOX_CONTAINERS Lnet/minecraft/tags/BlockItemTagId;
+   invokevirtual net/minecraft/tags/BlockItemTagId.block ()Lnet/minecraft/tags/TagKey;
+   putstatic net/minecraft/tags/BlockTags.JUKEBOX_CONTAINERS Lnet/minecraft/tags/TagKey;
    getstatic net/minecraft/tags/BlockItemTags.LIGHTNING_RODS Lnet/minecraft/tags/BlockItemTagId;
    invokevirtual net/minecraft/tags/BlockItemTagId.block ()Lnet/minecraft/tags/TagKey;
…
    invokestatic net/minecraft/tags/BlockTags.create (Ljava/lang/String;)Lnet/minecraft/tags/TagKey;
    putstatic net/minecraft/tags/BlockTags.ICE Lnet/minecraft/tags/TagKey;
+   ldc string "face_occluding_ice_blocks"
+   invokestatic net/minecraft/tags/BlockTags.create (Ljava/lang/String;)Lnet/minecraft/tags/TagKey;
+   putstatic net/minecraft/tags/BlockTags.FACE_OCCLUDING_ICE_BLOCKS Lnet/minecraft/tags/TagKey;
    ldc string "valid_spawn"
    invokestatic net/minecraft/tags/BlockTags.create (Ljava/lang/String;)Lnet/minecraft/tags/TagKey;
…
    invokestatic net/minecraft/tags/BlockTags.create (Ljava/lang/String;)Lnet/minecraft/tags/TagKey;
    putstatic net/minecraft/tags/BlockTags.DEEPSLATE_ORE_REPLACEABLES Lnet/minecraft/tags/TagKey;
+   ldc string "ice_cave_ore_replaceables"
+   invokestatic net/minecraft/tags/BlockTags.create (Ljava/lang/String;)Lnet/minecraft/tags/TagKey;
+   putstatic net/minecraft/tags/BlockTags.ICE_CAVE_ORE_REPLACEABLES Lnet/minecraft/tags/TagKey;
+   ldc string "ice_crevasse_replaceables"
+   invokestatic net/minecraft/tags/BlockTags.create (Ljava/lang/String;)Lnet/minecraft/tags/TagKey;
+   putstatic net/minecraft/tags/BlockTags.ICE_CREVASSE_REPLACEABLES Lnet/minecraft/tags/TagKey;
    ldc string "base_stone_nether"
    invokestatic net/minecraft/tags/BlockTags.create (Ljava/lang/String;)Lnet/minecraft/tags/TagKey;
…
    invokestatic net/minecraft/tags/BlockTags.create (Ljava/lang/String;)Lnet/minecraft/tags/TagKey;
    putstatic net/minecraft/tags/BlockTags.ICE_SPIKE_REPLACEABLE Lnet/minecraft/tags/TagKey;
+   ldc string "large_icicle_replaceable"
+   invokestatic net/minecraft/tags/BlockTags.create (Ljava/lang/String;)Lnet/minecraft/tags/TagKey;
+   putstatic net/minecraft/tags/BlockTags.LARGE_ICICLE_REPLACEABLE Lnet/minecraft/tags/TagKey;
    ldc string "forest_rock_can_place_on"
    invokestatic net/minecraft/tags/BlockTags.create (Ljava/lang/String;)Lnet/minecraft/tags/TagKey;
…
    invokestatic net/minecraft/tags/BlockTags.create (Ljava/lang/String;)Lnet/minecraft/tags/TagKey;
    putstatic net/minecraft/tags/BlockTags.TRIGGERS_AMBIENT_DRIED_GHAST_BLOCK_SOUNDS Lnet/minecraft/tags/TagKey;
+   ldc string "triggers_ambient_ice_block_sounds"
+   invokestatic net/minecraft/tags/BlockTags.create (Ljava/lang/String;)Lnet/minecraft/tags/TagKey;
+   putstatic net/minecraft/tags/BlockTags.TRIGGERS_AMBIENT_ICE_BLOCK_SOUNDS Lnet/minecraft/tags/TagKey;
+   ldc string "triggers_ambient_ice_crystal_sounds"
+   invokestatic net/minecraft/tags/BlockTags.create (Ljava/lang/String;)Lnet/minecraft/tags/TagKey;
+   putstatic net/minecraft/tags/BlockTags.TRIGGERS_AMBIENT_ICE_CRYSTAL_SOUNDS Lnet/minecraft/tags/TagKey;
    ldc string "required_for_poplar_leaf_ambience"
    invokestatic net/minecraft/tags/BlockTags.create (Ljava/lang/String;)Lnet/minecraft/tags/TagKey;
…
    invokestatic net/minecraft/tags/BlockTags.create (Ljava/lang/String;)Lnet/minecraft/tags/TagKey;
    putstatic net/minecraft/tags/BlockTags.ICE_MELTS_WHEN_DESTROYED_ABOVE Lnet/minecraft/tags/TagKey;
+   ldc string "melts_icicle_above"
+   invokestatic net/minecraft/tags/BlockTags.create (Ljava/lang/String;)Lnet/minecraft/tags/TagKey;
+   putstatic net/minecraft/tags/BlockTags.MELTS_ICICLE_ABOVE Lnet/minecraft/tags/TagKey;
    ldc string "causes_suffocation"
    invokestatic net/minecraft/tags/BlockTags.create (Ljava/lang/String;)Lnet/minecraft/tags/TagKey;
…
    invokestatic net/minecraft/tags/BlockTags.create (Ljava/lang/String;)Lnet/minecraft/tags/TagKey;
    putstatic net/minecraft/tags/BlockTags.WASHED_AWAY_BY_FLUIDS Lnet/minecraft/tags/TagKey;
+   ldc string "drop_down"
+   invokestatic net/minecraft/tags/BlockTags.create (Ljava/lang/String;)Lnet/minecraft/tags/TagKey;
+   putstatic net/minecraft/tags/BlockTags.DROP_DOWN Lnet/minecraft/tags/TagKey;
+   ldc string "pathfinding/avoid_in_air"
```

28 more lines. `java:sources --list 'BlockTags.DOORS'` prints the listing under each `--java`.

#### `BubbleColumnBlock.getFluidState`

Tagged at `packages/prismarine/src/entity/data/EntityRuntime.ts:8936`.

```diff
  method net/minecraft/world/level/block/BubbleColumnBlock.getFluidState(Lnet/minecraft/world/level/block/state/BlockState;)Lnet/minecraft/world/level/material/FluidState;
    getstatic net/minecraft/world/level/material/Fluids.WATER Lnet/minecraft/world/level/material/FlowingFluid;
-   iconst_0
-   invokevirtual net/minecraft/world/level/material/FlowingFluid.getSource (Z)Lnet/minecraft/world/level/material/FluidState;
+   invokevirtual net/minecraft/world/level/material/FlowingFluid.getSource ()Lnet/minecraft/world/level/material/FluidState;
    areturn
```

#### `BubbleColumnBlock.updateColumn(Lnet/minecraft/world/level/block/Block;Lnet/minecraft/world/level/LevelAccessor;Lnet/minecraft/core/BlockPos;Lnet/minecraft/world/level/block/state/BlockState;Lnet/minecraft/world/level/block/state/BlockState;)V`

Tagged at `packages/block-behaviors/src/families/world.ts:53`.

```diff
    ireturn
    aload_1
-   invokevirtual net/minecraft/world/level/block/state/BlockState.getFluidState ()Lnet/minecraft/world/level/material/FluidState;
-   astore_2
-   aload_2
-   getstatic net/minecraft/tags/FluidTags.BUBBLE_COLUMN_CAN_OCCUPY Lnet/minecraft/tags/TagKey;
-   invokevirtual net/minecraft/world/level/material/FluidState.is (Lnet/minecraft/tags/TagKey;)Z
-   ifeq L26
-   aload_1
    invokevirtual net/minecraft/world/level/block/state/BlockState.getBlock ()Lnet/minecraft/world/level/block/Block;
    instanceof net/minecraft/world/level/block/LiquidBlock
-   ifeq L26
-   aload_2
-   invokevirtual net/minecraft/world/level/material/FluidState.isSource ()Z
-   ifeq L26
-   aload_2
-   invokevirtual net/minecraft/world/level/material/FluidState.getAmount ()I
-   bipush 8
-   if_icmplt L26
+   ifeq L15
+   aload_1
+   invokestatic net/minecraft/world/level/block/LiquidBlock.shouldBubbleColumnOccupy (Lnet/minecraft/world/level/block/state/BlockState;)Z
+   ifeq L15
    iconst_1
-   goto L27
+   goto L16
    iconst_0
    ireturn
```

#### `CeilingHangingSignBlock.getStateForPlacement`

Tagged at `packages/block-behaviors/src/rules/javaPlacement.ts:313`.

```diff
    aload_3
    getstatic net/minecraft/world/level/material/Fluids.WATER Lnet/minecraft/world/level/material/FlowingFluid;
-   invokevirtual net/minecraft/world/level/material/FluidState.is (Ljava/lang/Object;)Z
+   invokevirtual net/minecraft/world/level/material/FluidState.isSourceOfType (Lnet/minecraft/world/level/material/Fluid;)Z
    invokestatic java/lang/Boolean.valueOf (Z)Ljava/lang/Boolean;
    invokevirtual net/minecraft/world/level/block/state/BlockState.setValue (Lnet/minecraft/world/level/block/state/properties/Property;Ljava/lang/Comparable;)Ljava/lang/Object;
```

#### `ChestBlock.getStateForPlacement`

Tagged at `packages/block-behaviors/src/families/containers.ts:105`.

```diff
    astore_3
    aload_1
-   invokevirtual net/minecraft/world/item/context/BlockPlaceContext.getLevel ()Lnet/minecraft/world/level/Level;
-   aload_1
-   invokevirtual net/minecraft/world/item/context/BlockPlaceContext.getClickedPos ()Lnet/minecraft/core/BlockPos;
-   invokevirtual net/minecraft/world/level/Level.getFluidState (Lnet/minecraft/core/BlockPos;)Lnet/minecraft/world/level/material/FluidState;
+   invokevirtual net/minecraft/world/item/context/BlockPlaceContext.getClickedFluidState ()Lnet/minecraft/world/level/material/FluidState;
    astore 4
    aload_1
…
    invokevirtual net/minecraft/core/Direction.getAxis ()Lnet/minecraft/core/Direction$Axis;
    invokevirtual net/minecraft/core/Direction$Axis.isHorizontal ()Z
-   ifeq L51
+   ifeq L48
    iload 5
-   ifeq L51
+   ifeq L48
    aload_0
    aload_1
…
    astore 7
    aload 7
-   ifnull L51
+   ifnull L48
    aload 7
    invokevirtual net/minecraft/core/Direction.getAxis ()Lnet/minecraft/core/Direction$Axis;
    aload 6
    invokevirtual net/minecraft/core/Direction.getAxis ()Lnet/minecraft/core/Direction$Axis;
-   if_acmpeq L51
+   if_acmpeq L48
    aload 7
    astore_3
…
    aload 6
    invokevirtual net/minecraft/core/Direction.getOpposite ()Lnet/minecraft/core/Direction;
-   if_acmpne L49
+   if_acmpne L46
    getstatic net/minecraft/world/level/block/state/properties/ChestType.RIGHT Lnet/minecraft/world/level/block/state/properties/ChestType;
-   goto L50
+   goto L47
    getstatic net/minecraft/world/level/block/state/properties/ChestType.LEFT Lnet/minecraft/world/level/block/state/properties/ChestType;
    astore_2
    aload_2
    getstatic net/minecraft/world/level/block/state/properties/ChestType.SINGLE Lnet/minecraft/world/level/block/state/properties/ChestType;
-   if_acmpne L64
+   if_acmpne L61
    iload 5
-   ifne L64
+   ifne L61
    aload_0
    aload_1
…
    aload 4
    getstatic net/minecraft/world/level/material/Fluids.WATER Lnet/minecraft/world/level/material/FlowingFluid;
-   invokevirtual net/minecraft/world/level/material/FluidState.is (Ljava/lang/Object;)Z
+   invokevirtual net/minecraft/world/level/material/FluidState.isSourceOfType (Lnet/minecraft/world/level/material/Fluid;)Z
    invokestatic java/lang/Boolean.valueOf (Z)Ljava/lang/Boolean;
    invokevirtual net/minecraft/world/level/block/state/BlockState.setValue (Lnet/minecraft/world/level/block/state/properties/Property;Ljava/lang/Comparable;)Ljava/lang/Object;
```

#### `ChunkGenerator.findNearestMapStructure`

Tagged at `packages/prismarine/src/world/generators/datadriven/javaStructurePlacement.ts:222`, `packages/prismarine/src/world/generators/datadriven/javaStructureStarts.ts:360`.

```diff
    aload 6
    invokeinterface java/util/Iterator.hasNext ()Z
-   ifeq L68
+   ifeq L65
    aload 6
    invokeinterface java/util/Iterator.next ()Ljava/lang/Object;
…
    astore 10
    aload 10
-   ifnull L67
-   aload 10
-   invokevirtual net/minecraft/world/level/levelgen/structure/StructureStart.isValid ()Z
-   ifeq L67
+   ifnull L64
    iload_3
-   ifeq L60
+   ifeq L57
    aload_2
    aload 10
    invokestatic net/minecraft/world/level/chunk/ChunkGenerator.tryAddReference (Lnet/minecraft/world/level/StructureManager;Lnet/minecraft/world/level/levelgen/structure/StructureStart;)Z
-   ifeq L67
+   ifeq L64
    aload 4
    aload 10
```

#### `CombatRules.getDamageAfterMagicAbsorb`

Tagged at `packages/prismarine/src/entity/Damage.ts:47`.

```diff
    fconst_0
    ldc float 20
-   invokestatic net/minecraft/util/Mth.clamp (FFF)F
+   invokestatic java/lang/Math.clamp (FFF)F
    fstore_2
    fload_0
```

#### `CopperGolemStatueBlock.getStateForPlacement`

Tagged at `packages/block-behaviors/src/rules/javaPlacement.ts:358`.

```diff
  method net/minecraft/world/level/block/CopperGolemStatueBlock.getStateForPlacement(Lnet/minecraft/world/item/context/BlockPlaceContext;)Lnet/minecraft/world/level/block/state/BlockState;
    aload_1
-   invokevirtual net/minecraft/world/item/context/BlockPlaceContext.getLevel ()Lnet/minecraft/world/level/Level;
-   aload_1
-   invokevirtual net/minecraft/world/item/context/BlockPlaceContext.getClickedPos ()Lnet/minecraft/core/BlockPos;
-   invokevirtual net/minecraft/world/level/Level.getFluidState (Lnet/minecraft/core/BlockPos;)Lnet/minecraft/world/level/material/FluidState;
+   invokevirtual net/minecraft/world/item/context/BlockPlaceContext.getClickedFluidState ()Lnet/minecraft/world/level/material/FluidState;
    astore_2
    aload_0
…
    aload_2
    getstatic net/minecraft/world/level/material/Fluids.WATER Lnet/minecraft/world/level/material/FlowingFluid;
-   invokevirtual net/minecraft/world/level/material/FluidState.is (Ljava/lang/Object;)Z
+   invokevirtual net/minecraft/world/level/material/FluidState.isSourceOfType (Lnet/minecraft/world/level/material/Fluid;)Z
    invokestatic java/lang/Boolean.valueOf (Z)Ljava/lang/Boolean;
    invokevirtual net/minecraft/world/level/block/state/BlockState.setValue (Lnet/minecraft/world/level/block/state/properties/Property;Ljava/lang/Comparable;)Ljava/lang/Object;
```

#### `DefaultRedstoneWireEvaluator.updatePowerStrength`

Tagged at `packages/block-behaviors/src/families/redstone.ts:525`.

```diff
    invokevirtual java/lang/Integer.intValue ()I
    iload 6
-   if_icmpeq L72
+   if_icmpeq L74
    aload_1
    aload_2
…
    invokevirtual net/minecraft/world/level/Level.setBlock (Lnet/minecraft/core/BlockPos;Lnet/minecraft/world/level/block/state/BlockState;I)Z
    pop
-   invokestatic com/google/common/collect/Sets.newHashSet ()Ljava/util/HashSet;
+   new java/util/HashSet
+   dup
+   invokespecial java/util/HashSet.<init> ()V
    astore 7
    aload 7
…
    iload 10
    iload 9
-   if_icmpge L56
+   if_icmpge L58
    aload 8
    iload 10
…
    pop
    iinc 10 1
-   goto L41
+   goto L43
    aload 7
    invokeinterface java/util/Set.iterator ()Ljava/util/Iterator;
…
    aload 8
    invokeinterface java/util/Iterator.hasNext ()Z
-   ifeq L72
+   ifeq L74
    aload 8
    invokeinterface java/util/Iterator.next ()Ljava/lang/Object;
…
    getfield net/minecraft/world/level/redstone/DefaultRedstoneWireEvaluator.wireBlock Lnet/minecraft/world/level/block/RedstoneWireBlock;
    invokevirtual net/minecraft/world/level/Level.updateNeighborsAt (Lnet/minecraft/core/BlockPos;Lnet/minecraft/world/level/block/Block;)V
-   goto L59
+   goto L61
    return
  inlined net/minecraft/world/level/redstone/DefaultRedstoneWireEvaluator.calculateTargetStrength(Lnet/minecraft/world/level/Level;Lnet/minecraft/core/BlockPos;)I
```

#### `DragonSittingScanningPhase.doServerTick`

Tagged at `packages/entity-goals/src/goals/dragonPhases.ts:745`.

```diff
    ldc2_w double -100
    ldc2_w double 100
-   invokestatic net/minecraft/util/Mth.clamp (DDD)D
+   invokestatic java/lang/Math.clamp (DDD)D
    dstore 11
    aload_0
```

#### `DriedGhastBlock.getStateForPlacement`

Tagged at `packages/block-behaviors/src/rules/javaPlacement.ts:362`.

```diff
  method net/minecraft/world/level/block/DriedGhastBlock.getStateForPlacement(Lnet/minecraft/world/item/context/BlockPlaceContext;)Lnet/minecraft/world/level/block/state/BlockState;
    aload_1
-   invokevirtual net/minecraft/world/item/context/BlockPlaceContext.getLevel ()Lnet/minecraft/world/level/Level;
-   aload_1
-   invokevirtual net/minecraft/world/item/context/BlockPlaceContext.getClickedPos ()Lnet/minecraft/core/BlockPos;
-   invokevirtual net/minecraft/world/level/Level.getFluidState (Lnet/minecraft/core/BlockPos;)Lnet/minecraft/world/level/material/FluidState;
+   invokevirtual net/minecraft/world/item/context/BlockPlaceContext.getClickedFluidState ()Lnet/minecraft/world/level/material/FluidState;
    astore_2
    aload_2
    getstatic net/minecraft/world/level/material/Fluids.WATER Lnet/minecraft/world/level/material/FlowingFluid;
-   invokevirtual net/minecraft/world/level/material/FluidState.is (Ljava/lang/Object;)Z
+   invokevirtual net/minecraft/world/level/material/FluidState.isSourceOfType (Lnet/minecraft/world/level/material/Fluid;)Z
    istore_3
    aload_0
```

#### `DyeColor.BLACK`

Tagged at `packages/prismarine/src/entity/javaSpawnEvents.ts:165`.

```diff
    iconst_0
    ldc string "white"
-   ldc int 16383998
-   getstatic net/minecraft/world/level/material/MapColor.SNOW Lnet/minecraft/world/level/material/MapColor;
-   getstatic net/minecraft/world/level/material/MapColor.TERRACOTTA_WHITE Lnet/minecraft/world/level/material/MapColor;
-   ldc int 15790320
-   ldc int 16777215
-   invokespecial net/minecraft/world/item/DyeColor.<init> (Ljava/lang/String;IILjava/lang/String;ILnet/minecraft/world/level/material/MapColor;Lnet/minecraft/world/level/material/MapColor;II)V
+   invokespecial net/minecraft/world/item/DyeColor.<init> (Ljava/lang/String;IILjava/lang/String;)V
    putstatic net/minecraft/world/item/DyeColor.WHITE Lnet/minecraft/world/item/DyeColor;
    new net/minecraft/world/item/DyeColor
…
    iconst_1
    ldc string "orange"
-   ldc int 16351261
-   getstatic net/minecraft/world/level/material/MapColor.COLOR_ORANGE Lnet/minecraft/world/level/material/MapColor;
-   getstatic net/minecraft/world/level/material/MapColor.TERRACOTTA_ORANGE Lnet/minecraft/world/level/material/MapColor;
-   ldc int 15435844
-   ldc int 16738335
-   invokespecial net/minecraft/world/item/DyeColor.<init> (Ljava/lang/String;IILjava/lang/String;ILnet/minecraft/world/level/material/MapColor;Lnet/minecraft/world/level/material/MapColor;II)V
+   invokespecial net/minecraft/world/item/DyeColor.<init> (Ljava/lang/String;IILjava/lang/String;)V
    putstatic net/minecraft/world/item/DyeColor.ORANGE Lnet/minecraft/world/item/DyeColor;
    new net/minecraft/world/item/DyeColor
…
    iconst_2
    ldc string "magenta"
-   ldc int 13061821
-   getstatic net/minecraft/world/level/material/MapColor.COLOR_MAGENTA Lnet/minecraft/world/level/material/MapColor;
-   getstatic net/minecraft/world/level/material/MapColor.TERRACOTTA_MAGENTA Lnet/minecraft/world/level/material/MapColor;
-   ldc int 12801229
-   ldc int 16711935
-   invokespecial net/minecraft/world/item/DyeColor.<init> (Ljava/lang/String;IILjava/lang/String;ILnet/minecraft/world/level/material/MapColor;Lnet/minecraft/world/level/material/MapColor;II)V
+   invokespecial net/minecraft/world/item/DyeColor.<init> (Ljava/lang/String;IILjava/lang/String;)V
    putstatic net/minecraft/world/item/DyeColor.MAGENTA Lnet/minecraft/world/item/DyeColor;
    new net/minecraft/world/item/DyeColor
…
    iconst_3
    ldc string "light_blue"
-   ldc int 3847130
-   getstatic net/minecraft/world/level/material/MapColor.COLOR_LIGHT_BLUE Lnet/minecraft/world/level/material/MapColor;
-   getstatic net/minecraft/world/level/material/MapColor.TERRACOTTA_LIGHT_BLUE Lnet/minecraft/world/level/material/MapColor;
-   ldc int 6719955
-   ldc int 10141901
-   invokespecial net/minecraft/world/item/DyeColor.<init> (Ljava/lang/String;IILjava/lang/String;ILnet/minecraft/world/level/material/MapColor;Lnet/minecraft/world/level/material/MapColor;II)V
+   invokespecial net/minecraft/world/item/DyeColor.<init> (Ljava/lang/String;IILjava/lang/String;)V
    putstatic net/minecraft/world/item/DyeColor.LIGHT_BLUE Lnet/minecraft/world/item/DyeColor;
    new net/minecraft/world/item/DyeColor
…
    iconst_4
    ldc string "yellow"
-   ldc int 16701501
-   getstatic net/minecraft/world/level/material/MapColor.COLOR_YELLOW Lnet/minecraft/world/level/material/MapColor;
-   getstatic net/minecraft/world/level/material/MapColor.TERRACOTTA_YELLOW Lnet/minecraft/world/level/material/MapColor;
-   ldc int 14602026
-   ldc int 16776960
-   invokespecial net/minecraft/world/item/DyeColor.<init> (Ljava/lang/String;IILjava/lang/String;ILnet/minecraft/world/level/material/MapColor;Lnet/minecraft/world/level/material/MapColor;II)V
+   invokespecial net/minecraft/world/item/DyeColor.<init> (Ljava/lang/String;IILjava/lang/String;)V
    putstatic net/minecraft/world/item/DyeColor.YELLOW Lnet/minecraft/world/item/DyeColor;
    new net/minecraft/world/item/DyeColor
…
```

215 more lines. `java:sources --list 'DyeColor.BLACK'` prints the listing under each `--java`.

#### `EmptyMapItem.use`

Tagged at `packages/prismarine/src/item/actorPort.ts:503`.

```diff
    aload_2
    invokevirtual net/minecraft/world/entity/player/Player.getSoundSource ()Lnet/minecraft/sounds/SoundSource;
-   fconst_1
-   fconst_1
-   invokevirtual net/minecraft/server/level/ServerLevel.playSound (Lnet/minecraft/world/entity/Entity;Lnet/minecraft/world/entity/Entity;Lnet/minecraft/sounds/SoundEvent;Lnet/minecraft/sounds/SoundSource;FF)V
+   invokevirtual net/minecraft/server/level/ServerLevel.playSound (Lnet/minecraft/world/entity/Entity;Lnet/minecraft/world/entity/Entity;Lnet/minecraft/sounds/SoundEvent;Lnet/minecraft/sounds/SoundSource;)V
    aload 5
    aload_2
…
    aload 4
    invokevirtual net/minecraft/world/item/ItemStack.isEmpty ()Z
-   ifeq L48
+   ifeq L46
    getstatic net/minecraft/world/InteractionResult.SUCCESS Lnet/minecraft/world/InteractionResult$Success;
    aload 6
…
    invokevirtual net/minecraft/world/item/ItemStack.copy ()Lnet/minecraft/world/item/ItemStack;
    invokevirtual net/minecraft/world/entity/player/Inventory.add (Lnet/minecraft/world/item/ItemStack;)Z
-   ifne L60
+   ifne L58
    aload_2
    aload 6
```

#### `EnderChestBlock.getStateForPlacement`

Tagged at `packages/block-behaviors/src/rules/javaPlacement.ts:364`.

```diff
  method net/minecraft/world/level/block/EnderChestBlock.getStateForPlacement(Lnet/minecraft/world/item/context/BlockPlaceContext;)Lnet/minecraft/world/level/block/state/BlockState;
    aload_1
-   invokevirtual net/minecraft/world/item/context/BlockPlaceContext.getLevel ()Lnet/minecraft/world/level/Level;
-   aload_1
-   invokevirtual net/minecraft/world/item/context/BlockPlaceContext.getClickedPos ()Lnet/minecraft/core/BlockPos;
-   invokevirtual net/minecraft/world/level/Level.getFluidState (Lnet/minecraft/core/BlockPos;)Lnet/minecraft/world/level/material/FluidState;
+   invokevirtual net/minecraft/world/item/context/BlockPlaceContext.getClickedFluidState ()Lnet/minecraft/world/level/material/FluidState;
    astore_2
    aload_0
…
    aload_2
    getstatic net/minecraft/world/level/material/Fluids.WATER Lnet/minecraft/world/level/material/FlowingFluid;
-   invokevirtual net/minecraft/world/level/material/FluidState.is (Ljava/lang/Object;)Z
+   invokevirtual net/minecraft/world/level/material/FluidState.isSourceOfType (Lnet/minecraft/world/level/material/Fluid;)Z
    invokestatic java/lang/Boolean.valueOf (Z)Ljava/lang/Boolean;
    invokevirtual net/minecraft/world/level/block/state/BlockState.setValue (Lnet/minecraft/world/level/block/state/properties/Property;Ljava/lang/Comparable;)Ljava/lang/Object;
```

#### `EnderDragon.aiStep`

Tagged at `packages/entity-goals/src/goals/dragonPhases.ts:863`, `packages/entity-goals/src/goals/dragonPhases.ts:917`, `packages/entity-goals/src/goals/dragonPhases.ts:956`.

```diff
    invokevirtual net/minecraft/world/entity/boss/enderdragon/phases/EnderDragonPhaseManager.getCurrentPhase ()Lnet/minecraft/world/entity/boss/enderdragon/phases/DragonPhaseInstance;
    invokeinterface net/minecraft/world/entity/boss/enderdragon/phases/DragonPhaseInstance.doClientTick ()V
-   goto L479
+   goto L476
    aload_0
    getfield net/minecraft/world/entity/boss/enderdragon/EnderDragon.phaseManager Lnet/minecraft/world/entity/boss/enderdragon/phases/EnderDragonPhaseManager;
…
    astore 5
    aload 5
-   ifnull L479
+   ifnull L476
    aload 5
    getfield net/minecraft/world/phys/Vec3.x D
…
    fload 14
    f2d
-   invokestatic net/minecraft/util/Mth.clamp (DDD)D
+   invokestatic java/lang/Math.clamp (DDD)D
    dstore 8
    aload_0
-   aload_0
-   invokevirtual net/minecraft/world/entity/boss/enderdragon/EnderDragon.getDeltaMovement ()Lnet/minecraft/world/phys/Vec3;
    dconst_0
    dload 8
-   ldc2_w double 0.01
+   ldc2_w double 0.1
    dmul
    dconst_0
-   invokevirtual net/minecraft/world/phys/Vec3.add (DDD)Lnet/minecraft/world/phys/Vec3;
-   invokevirtual net/minecraft/world/entity/boss/enderdragon/EnderDragon.setDeltaMovement (Lnet/minecraft/world/phys/Vec3;)V
+   invokevirtual net/minecraft/world/entity/boss/enderdragon/EnderDragon.addDeltaMovement (DDD)V
    aload_0
    aload_0
…
    ldc2_w double 0.000009999999747378752
    dcmpl
-   ifgt L373
+   ifgt L370
    dload 10
    invokestatic java/lang/Math.abs (D)D
    ldc2_w double 0.000009999999747378752
    dcmpl
-   ifle L413
+   ifle L410
    ldc float 180
    dload 6
…
    ldc float -50
    ldc float 50
-   invokestatic net/minecraft/util/Mth.clamp (FFF)F
+   invokestatic java/lang/Math.clamp (FFF)F
    fstore 20
    aload_0
…
    aload_0
    getfield net/minecraft/world/entity/boss/enderdragon/EnderDragon.inWall Z
-   ifeq L450
+   ifeq L447
    aload_0
    getstatic net/minecraft/world/entity/MoverType.SELF Lnet/minecraft/world/entity/MoverType;
```

103 more lines. `java:sources --list 'EnderDragon.aiStep'` prints the listing under each `--java`.

#### `EnderDragon.findPath`

Tagged at `packages/entity-goals/src/goals/dragonNodes.ts:232`.

```diff
    areturn
  inlined net/minecraft/world/entity/boss/enderdragon/EnderDragon.reconstructPath(Lnet/minecraft/world/level/pathfinder/Node;Lnet/minecraft/world/level/pathfinder/Node;)Lnet/minecraft/world/level/pathfinder/Path;
-   invokestatic com/google/common/collect/Lists.newArrayList ()Ljava/util/ArrayList;
+   new java/util/ArrayList
+   dup
+   invokespecial java/util/ArrayList.<init> ()V
    astore_3
    aload_2
…
    aload 4
    getfield net/minecraft/world/level/pathfinder/Node.cameFrom Lnet/minecraft/world/level/pathfinder/Node;
-   ifnull L19
+   ifnull L21
    aload 4
    getfield net/minecraft/world/level/pathfinder/Node.cameFrom Lnet/minecraft/world/level/pathfinder/Node;
…
    aload 4
    invokeinterface java/util/List.add (ILjava/lang/Object;)V
-   goto L8
+   goto L10
    new net/minecraft/world/level/pathfinder/Path
    dup
```

#### `Enderman.teleport(DDD)Z`

Tagged at `packages/prismarine/src/entity/data/EntityRuntime.ts:8472`.

```diff
    istore 8
    iload 8
-   ifeq L65
+   ifeq L61
    aload_0
    invokevirtual net/minecraft/world/entity/monster/Enderman.level ()Lnet/minecraft/world/level/Level;
…
    aload_0
    invokevirtual net/minecraft/world/entity/monster/Enderman.isSilent ()Z
-   ifne L65
+   ifne L61
    aload 7
    invokestatic net/minecraft/core/BlockPos.containing (Lnet/minecraft/core/Position;)Lnet/minecraft/core/BlockPos;
…
    aload_0
    invokevirtual net/minecraft/world/entity/monster/Enderman.getSoundSource ()Lnet/minecraft/sounds/SoundSource;
-   fconst_1
-   fconst_1
-   invokevirtual net/minecraft/world/level/Level.playSound (Lnet/minecraft/world/entity/Entity;DDDLnet/minecraft/sounds/SoundEvent;Lnet/minecraft/sounds/SoundSource;FF)V
+   invokevirtual net/minecraft/world/level/Level.playSound (Lnet/minecraft/world/entity/Entity;DDDLnet/minecraft/sounds/SoundEvent;Lnet/minecraft/sounds/SoundSource;)V
    aload_0
    getstatic net/minecraft/sounds/SoundEvents.ENDERMAN_TELEPORT Lnet/minecraft/sounds/SoundEvent;
-   fconst_1
-   fconst_1
-   invokevirtual net/minecraft/world/entity/monster/Enderman.playSound (Lnet/minecraft/sounds/SoundEvent;FF)V
+   invokevirtual net/minecraft/world/entity/monster/Enderman.playSound (Lnet/minecraft/sounds/SoundEvent;)V
    iload 8
    ireturn
```

#### `Entity.checkInsideBlocks(Lnet/minecraft/world/phys/Vec3;Lnet/minecraft/world/phys/Vec3;Lnet/minecraft/world/entity/InsideBlockEffectApplier$StepBasedCollector;Lit/unimi/dsi/fastutil/longs/LongSet;I)I`

Tagged at `packages/prismarine/src/world/SpawnPlacement.ts:89`, `packages/prismarine/src/world/World.ts:4618`.

```diff
    iconst_0
    istore 14
-   aload_0
    aload 12
    invokevirtual net/minecraft/world/level/block/state/BlockState.getFluidState ()Lnet/minecraft/world/level/material/FluidState;
+   astore 15
+   aload_0
+   aload 15
    aload 10
    aload 4
    aload 5
    invokevirtual net/minecraft/world/entity/Entity.collidedWithFluid (Lnet/minecraft/world/level/material/FluidState;Lnet/minecraft/core/BlockPos;Lnet/minecraft/world/phys/Vec3;Lnet/minecraft/world/phys/Vec3;)Z
-   istore 15
+   istore 16
    iload 14
-   ifne L72
-   iload 15
-   ifeq L77
+   ifne L74
+   iload 16
+   ifeq L79
    aload 6
    aload 10
    invokevirtual net/minecraft/core/BlockPos.asLong ()J
    invokeinterface it/unimi/dsi/fastutil/longs/LongSet.add (J)Z
-   ifne L79
+   ifne L81
    iconst_1
    ireturn
    iload 14
-   ifeq L133
+   ifeq L142
    iload 7
-   ifne L87
+   ifne L89
    aload 8
    aload 10
    invokevirtual net/minecraft/world/phys/AABB.intersects (Lnet/minecraft/core/BlockPos;)Z
-   ifeq L89
+   ifeq L91
    iconst_1
-   goto L90
+   goto L92
    iconst_0
-   istore 16
+   istore 17
    aload 9
    iload 11
…
    aload_0
    aload 9
-   iload 16
+   iload 17
    invokevirtual net/minecraft/world/level/block/state/BlockState.entityInside (Lnet/minecraft/world/level/Level;Lnet/minecraft/core/BlockPos;Lnet/minecraft/world/entity/Entity;Lnet/minecraft/world/entity/InsideBlockEffectApplier;Z)V
+   aload 13
+   aload 4
+   aload 5
+   aload 10
+   invokedynamic getAsBoolean (Lnet/minecraft/world/phys/shapes/VoxelShape;Lnet/minecraft/world/phys/Vec3;Lnet/minecraft/world/phys/Vec3;Lnet/minecraft/core/BlockPos;)Ljava/util/function/BooleanSupplier; java/lang/invoke/LambdaMetafactory.metafactory [methodType ()Z, handle invokeStatic net/minecraft/world/entity/Entity.lambda#1(Lnet/minecraft/world/phys/shapes/VoxelShape;Lnet/minecraft/world/phys/Vec3;Lnet/minecraft/world/phys/Vec3;Lnet/minecraft/core/BlockPos;)Z, methodType ()Z]
+   astore 18
```

96 more lines. `java:sources --list 'Entity.checkInsideBlocks(Lnet/minecraft/world/phys/Vec3;Lnet/minecraft/world/phys/Vec3;Lnet/minecraft/world/entity/InsideBlockEffectApplier$StepBasedCollector;Lit/unimi/dsi/fastutil/longs/LongSet;I)I'` prints the listing under each `--java`.

#### `Entity.move`

Tagged at `packages/prismarine/src/entity/data/collision.ts:428`, `packages/prismarine/src/entity/data/droppedItems.ts:462`.

```diff
  method net/minecraft/world/entity/Entity.move(Lnet/minecraft/world/entity/MoverType;Lnet/minecraft/world/phys/Vec3;)V
-   getstatic net/minecraft/SharedConstants.IS_RUNNING_IN_IDE Z
+   getstatic net/minecraft/util/DevUtil.IS_RUNNING_IN_IDE Z
    ifeq L15
    aload_1
…
    ldc string "Attempted to move entity on a logical side not permitted to simulate movement"
    invokespecial java/lang/IllegalStateException.<init> (Ljava/lang/String;)V
-   invokestatic net/minecraft/util/Util.pauseInIde (Ljava/lang/Throwable;)Ljava/lang/Throwable;
+   invokestatic net/minecraft/util/DevUtil.pauseInIde (Ljava/lang/Throwable;)Ljava/lang/Throwable;
    checkcast java/lang/IllegalStateException
    athrow
…
    ldc2_w double 1e-7
    dcmpg
-   ifge L175
-   aload_0
-   getfield net/minecraft/world/entity/Entity.fallDistance D
-   dconst_0
-   dcmpl
-   ifeq L153
-   dload 5
-   dconst_1
-   dcmpl
-   iflt L153
-   aload 4
-   invokevirtual net/minecraft/world/phys/Vec3.length ()D
-   ldc2_w double 8
-   invokestatic java/lang/Math.min (DD)D
-   dstore 7
-   aload_0
-   invokevirtual net/minecraft/world/entity/Entity.position ()Lnet/minecraft/world/phys/Vec3;
-   aload 4
-   invokevirtual net/minecraft/world/phys/Vec3.normalize ()Lnet/minecraft/world/phys/Vec3;
-   dload 7
-   invokevirtual net/minecraft/world/phys/Vec3.scale (D)Lnet/minecraft/world/phys/Vec3;
-   invokevirtual net/minecraft/world/phys/Vec3.add (Lnet/minecraft/world/phys/Vec3;)Lnet/minecraft/world/phys/Vec3;
-   astore 9
-   aload_0
-   invokevirtual net/minecraft/world/entity/Entity.level ()Lnet/minecraft/world/level/Level;
-   new net/minecraft/world/level/ClipContext
-   dup
-   aload_0
-   invokevirtual net/minecraft/world/entity/Entity.position ()Lnet/minecraft/world/phys/Vec3;
-   aload 9
-   getstatic net/minecraft/world/level/ClipContext$Block.FALLDAMAGE_RESETTING Lnet/minecraft/world/level/ClipContext$Block;
-   getstatic net/minecraft/world/level/ClipContext$Fluid.WATER Lnet/minecraft/world/level/ClipContext$Fluid;
-   aload_0
-   invokespecial net/minecraft/world/level/ClipContext.<init> (Lnet/minecraft/world/phys/Vec3;Lnet/minecraft/world/phys/Vec3;Lnet/minecraft/world/level/ClipContext$Block;Lnet/minecraft/world/level/ClipContext$Fluid;Lnet/minecraft/world/entity/Entity;)V
-   invokevirtual net/minecraft/world/level/Level.clip (Lnet/minecraft/world/level/ClipContext;)Lnet/minecraft/world/phys/BlockHitResult;
-   astore 10
-   aload 10
-   invokevirtual net/minecraft/world/phys/BlockHitResult.getType ()Lnet/minecraft/world/phys/HitResult$Type;
-   getstatic net/minecraft/world/phys/HitResult$Type.MISS Lnet/minecraft/world/phys/HitResult$Type;
-   if_acmpeq L153
-   aload_0
-   invokevirtual net/minecraft/world/entity/Entity.resetFallDistance ()V
+   ifge L134
    aload_0
    invokevirtual net/minecraft/world/entity/Entity.position ()Lnet/minecraft/world/phys/Vec3;
```

149 more lines. `java:sources --list 'Entity.move'` prints the listing under each `--java`.

#### `EquipmentSlot.SADDLE`

Tagged at `packages/prismarine/src/inventory/slotAddress.ts:123`.

```diff
    invokestatic java/util/List.of ([Ljava/lang/Object;)Ljava/util/List;
    putstatic net/minecraft/world/entity/EquipmentSlot.VALUES Ljava/util/List;
-   invokedynamic applyAsInt ()Ljava/util/function/ToIntFunction; java/lang/invoke/LambdaMetafactory.metafactory [methodType (Ljava/lang/Object;)I, handle invokeStatic net/minecraft/world/entity/EquipmentSlot.lambda#0(Lnet/minecraft/world/entity/EquipmentSlot;)I, methodType (Lnet/minecraft/world/entity/EquipmentSlot;)I]
-   invokestatic net/minecraft/world/entity/EquipmentSlot.values ()[Lnet/minecraft/world/entity/EquipmentSlot;
-   getstatic net/minecraft/util/ByIdMap$OutOfBoundsStrategy.ZERO Lnet/minecraft/util/ByIdMap$OutOfBoundsStrategy;
-   invokestatic net/minecraft/util/ByIdMap.continuous (Ljava/util/function/ToIntFunction;[Ljava/lang/Object;Lnet/minecraft/util/ByIdMap$OutOfBoundsStrategy;)Ljava/util/function/IntFunction;
-   putstatic net/minecraft/world/entity/EquipmentSlot.BY_ID Ljava/util/function/IntFunction;
    invokedynamic get ()Ljava/util/function/Supplier; java/lang/invoke/LambdaMetafactory.metafactory [methodType ()Ljava/lang/Object;, handle invokeStatic net/minecraft/world/entity/EquipmentSlot.values()[Lnet/minecraft/world/entity/EquipmentSlot;, methodType ()[Lnet/minecraft/world/entity/EquipmentSlot;]
    invokestatic net/minecraft/util/StringRepresentable.fromEnum (Ljava/util/function/Supplier;)Lnet/minecraft/util/StringRepresentable$EnumCodec;
    putstatic net/minecraft/world/entity/EquipmentSlot.CODEC Lnet/minecraft/util/StringRepresentable$EnumCodec;
-   getstatic net/minecraft/world/entity/EquipmentSlot.BY_ID Ljava/util/function/IntFunction;
-   invokedynamic applyAsInt ()Ljava/util/function/ToIntFunction; java/lang/invoke/LambdaMetafactory.metafactory [methodType (Ljava/lang/Object;)I, handle invokeStatic net/minecraft/world/entity/EquipmentSlot.lambda#1(Lnet/minecraft/world/entity/EquipmentSlot;)I, methodType (Lnet/minecraft/world/entity/EquipmentSlot;)I]
-   invokestatic net/minecraft/network/codec/ByteBufCodecs.idMapper (Ljava/util/function/IntFunction;Ljava/util/function/ToIntFunction;)Lnet/minecraft/network/codec/StreamCodec;
+   ldc class net/minecraft/world/entity/EquipmentSlot
+   invokedynamic applyAsInt ()Ljava/util/function/ToIntFunction; java/lang/invoke/LambdaMetafactory.metafactory [methodType (Ljava/lang/Object;)I, handle invokeStatic net/minecraft/world/entity/EquipmentSlot.lambda#0(Lnet/minecraft/world/entity/EquipmentSlot;)I, methodType (Lnet/minecraft/world/entity/EquipmentSlot;)I]
+   invokestatic net/minecraft/network/codec/ByteBufCodecs.enumCodec (Ljava/lang/Class;Ljava/util/function/ToIntFunction;)Lnet/minecraft/network/codec/EnumStreamCodec;
    putstatic net/minecraft/world/entity/EquipmentSlot.STREAM_CODEC Lnet/minecraft/network/codec/StreamCodec;
    return
…
    getfield net/minecraft/world/entity/EquipmentSlot.id I
    ireturn
- inlined net/minecraft/world/entity/EquipmentSlot.lambda#1(Lnet/minecraft/world/entity/EquipmentSlot;)I
-   aload_0
-   getfield net/minecraft/world/entity/EquipmentSlot.id I
-   ireturn
```

#### `EyeOfEnder.tick`

Tagged at `packages/prismarine/src/entity/data/eyeOfEnderSignals.ts:267`.

```diff
    invokevirtual net/minecraft/world/entity/projectile/EyeOfEnder.level ()Lnet/minecraft/world/level/Level;
    invokevirtual net/minecraft/world/level/Level.isClientSide ()Z
-   ifne L95
+   ifne L93
    aload_0
    dup
…
    getfield net/minecraft/world/entity/projectile/EyeOfEnder.life I
    bipush 80
-   if_icmple L95
+   if_icmple L93
    aload_0
    invokevirtual net/minecraft/world/entity/projectile/EyeOfEnder.level ()Lnet/minecraft/world/level/Level;
    invokevirtual net/minecraft/world/level/Level.isClientSide ()Z
-   ifne L95
+   ifne L93
    aload_0
    getstatic net/minecraft/sounds/SoundEvents.ENDER_EYE_DEATH Lnet/minecraft/sounds/SoundEvent;
-   fconst_1
-   fconst_1
-   invokevirtual net/minecraft/world/entity/projectile/EyeOfEnder.playSound (Lnet/minecraft/sounds/SoundEvent;FF)V
+   invokevirtual net/minecraft/world/entity/projectile/EyeOfEnder.playSound (Lnet/minecraft/sounds/SoundEvent;)V
    aload_0
    invokevirtual net/minecraft/world/entity/projectile/EyeOfEnder.discard ()V
    aload_0
    getfield net/minecraft/world/entity/projectile/EyeOfEnder.surviveAfterDeath Z
-   ifeq L88
+   ifeq L86
    aload_0
    invokevirtual net/minecraft/world/entity/projectile/EyeOfEnder.level ()Lnet/minecraft/world/level/Level;
…
    invokevirtual net/minecraft/world/level/Level.addFreshEntity (Lnet/minecraft/world/entity/Entity;)Z
    pop
-   goto L95
+   goto L93
    aload_0
    invokevirtual net/minecraft/world/entity/projectile/EyeOfEnder.level ()Lnet/minecraft/world/level/Level;
```

#### `FallingBlockEntity.tick`

Tagged at `packages/prismarine/src/entity/data/EntityRuntime.ts:8039`.

```diff
    invokevirtual net/minecraft/world/level/Level.getFluidState (Lnet/minecraft/core/BlockPos;)Lnet/minecraft/world/level/material/FluidState;
    getstatic net/minecraft/world/level/material/Fluids.WATER Lnet/minecraft/world/level/material/FlowingFluid;
-   invokevirtual net/minecraft/world/level/material/FluidState.is (Ljava/lang/Object;)Z
+   invokevirtual net/minecraft/world/level/material/FluidState.isSourceOfType (Lnet/minecraft/world/level/material/Fluid;)Z
    ifeq L202
    aload_0
…
    aload 13
    aload 14
-   invokestatic net/minecraft/world/level/storage/TagValueOutput.createWithContext (Lnet/minecraft/util/ProblemReporter;Lnet/minecraft/core/HolderLookup$Provider;)Lnet/minecraft/world/level/storage/TagValueOutput;
+   invokestatic net/minecraft/world/level/storage/TagValueOutput.createWithContext (Lnet/minecraft/util/ProblemReporter;Lnet/minecraft/core/HolderGetter$Provider;)Lnet/minecraft/world/level/storage/TagValueOutput;
    astore 15
    aload 12
…
    aload 14
    aload 16
-   invokestatic net/minecraft/world/level/storage/TagValueInput.create (Lnet/minecraft/util/ProblemReporter;Lnet/minecraft/core/HolderLookup$Provider;Lnet/minecraft/nbt/CompoundTag;)Lnet/minecraft/world/level/storage/ValueInput;
+   invokestatic net/minecraft/world/level/storage/TagValueInput.create (Lnet/minecraft/util/ProblemReporter;Lnet/minecraft/core/HolderGetter$Provider;Lnet/minecraft/nbt/CompoundTag;)Lnet/minecraft/world/level/storage/ValueInput;
    invokevirtual net/minecraft/world/level/block/entity/BlockEntity.loadWithComponents (Lnet/minecraft/world/level/storage/ValueInput;)V
    aload 13
```

#### `FlowingFluid.getSpread`

Tagged at `packages/block-behaviors/src/rules/fluid.ts:477`.

```diff
    sipush 1000
    istore 4
+   new java/util/EnumMap
+   dup
    ldc class net/minecraft/core/Direction
-   invokestatic com/google/common/collect/Maps.newEnumMap (Ljava/lang/Class;)Ljava/util/EnumMap;
+   invokespecial java/util/EnumMap.<init> (Ljava/lang/Class;)V
    astore 5
    aconst_null
…
    aload 11
    invokevirtual net/minecraft/world/level/material/FlowingFluid.canMaybePassThrough (Lnet/minecraft/world/level/BlockGetter;Lnet/minecraft/core/BlockPos;Lnet/minecraft/world/level/block/state/BlockState;Lnet/minecraft/core/Direction;Lnet/minecraft/core/BlockPos;Lnet/minecraft/world/level/block/state/BlockState;Lnet/minecraft/world/level/material/FluidState;)Z
-   ifne L39
-   goto L10
+   ifne L41
+   goto L12
    aload_0
    aload_1
…
    aload 10
    aload 12
-   invokevirtual net/minecraft/world/level/material/FluidState.getType ()Lnet/minecraft/world/level/material/Fluid;
-   invokestatic net/minecraft/world/level/material/FlowingFluid.canHoldSpecificFluid (Lnet/minecraft/world/level/BlockGetter;Lnet/minecraft/core/BlockPos;Lnet/minecraft/world/level/block/state/BlockState;Lnet/minecraft/world/level/material/Fluid;)Z
-   ifne L53
-   goto L10
+   invokestatic net/minecraft/world/level/material/FlowingFluid.canHoldSpecificFluid (Lnet/minecraft/world/level/BlockGetter;Lnet/minecraft/core/BlockPos;Lnet/minecraft/world/level/block/state/BlockState;Lnet/minecraft/world/level/material/FluidState;)Z
+   ifne L54
+   goto L12
    aload 6
-   ifnonnull L62
+   ifnonnull L63
    new net/minecraft/world/level/material/FlowingFluid$SpreadContext
    dup
…
    aload 9
    invokevirtual net/minecraft/world/level/material/FlowingFluid$SpreadContext.isHole (Lnet/minecraft/core/BlockPos;)Z
-   ifeq L69
+   ifeq L70
    iconst_0
    istore 13
-   goto L79
+   goto L80
    aload_0
    aload_1
…
    iload 13
    iload 4
-   if_icmpge L84
+   if_icmpge L85
    aload 5
    invokeinterface java/util/Map.clear ()V
…
    aload 9
    aload 12
-   invokevirtual net/minecraft/world/level/material/FluidState.getType ()Lnet/minecraft/world/level/material/Fluid;
    aload 8
-   invokevirtual net/minecraft/world/level/material/FluidState.canBeReplacedWith (Lnet/minecraft/world/level/BlockGetter;Lnet/minecraft/core/BlockPos;Lnet/minecraft/world/level/material/Fluid;Lnet/minecraft/core/Direction;)Z
+   invokevirtual net/minecraft/world/level/material/FluidState.canBeReplacedWith (Lnet/minecraft/world/level/BlockGetter;Lnet/minecraft/core/BlockPos;Lnet/minecraft/world/level/material/FluidState;Lnet/minecraft/core/Direction;)Z
    ifeq L100
    aload 5
```

39 more lines. `java:sources --list 'FlowingFluid.getSpread'` prints the listing under each `--java`.

#### `FoodData.tick`

Tagged at `packages/prismarine/src/entity/playerHunger.ts:14`, `packages/prismarine/src/entity/playerHunger.ts:62`, `packages/prismarine/src/entity/playerHunger.ts:70`, `packages/prismarine/src/entity/playerHunger.ts:152`, `packages/prismarine/src/entity/playerHunger.ts:222`.

```diff
    ifle L90
    aload_1
-   invokevirtual net/minecraft/server/level/ServerPlayer.isHurt ()Z
+   invokevirtual net/minecraft/server/level/ServerPlayer.canHealNaturally ()Z
    ifeq L90
    aload_0
…
    ldc float 6
    fdiv
-   invokevirtual net/minecraft/server/level/ServerPlayer.heal (F)V
+   invokevirtual net/minecraft/server/level/ServerPlayer.healNaturally (F)V
    aload_0
    fload 5
…
    if_icmplt L119
    aload_1
-   invokevirtual net/minecraft/server/level/ServerPlayer.isHurt ()Z
+   invokevirtual net/minecraft/server/level/ServerPlayer.canHealNaturally ()Z
    ifeq L119
    aload_0
…
    aload_1
    fconst_1
-   invokevirtual net/minecraft/server/level/ServerPlayer.heal (F)V
+   invokevirtual net/minecraft/server/level/ServerPlayer.healNaturally (F)V
    aload_0
    ldc float 6
```

#### `Fox$DefendTrustedTargetGoal.start`

Tagged at `packages/entity-goals/src/goals/targeting.ts:439`.

```diff
    getfield net/minecraft/world/entity/animal/fox/Fox$DefendTrustedTargetGoal.this$0 Lnet/minecraft/world/entity/animal/fox/Fox;
    getstatic net/minecraft/sounds/SoundEvents.FOX_AGGRO Lnet/minecraft/sounds/SoundEvent;
-   fconst_1
-   fconst_1
-   invokevirtual net/minecraft/world/entity/animal/fox/Fox.playSound (Lnet/minecraft/sounds/SoundEvent;FF)V
+   invokevirtual net/minecraft/world/entity/animal/fox/Fox.playSound (Lnet/minecraft/sounds/SoundEvent;)V
    aload_0
    getfield net/minecraft/world/entity/animal/fox/Fox$DefendTrustedTargetGoal.this$0 Lnet/minecraft/world/entity/animal/fox/Fox;
```

#### `Fox$FoxEatBerriesGoal.onReachedTarget`

Tagged at `packages/entity-goals/src/goals/work.ts:508`.

```diff
    getfield net/minecraft/world/entity/animal/fox/Fox$FoxEatBerriesGoal.this$0 Lnet/minecraft/world/entity/animal/fox/Fox;
    getstatic net/minecraft/sounds/SoundEvents.SWEET_BERRY_BUSH_PICK_BERRIES Lnet/minecraft/sounds/SoundEvent;
-   fconst_1
-   fconst_1
-   invokevirtual net/minecraft/world/entity/animal/fox/Fox.playSound (Lnet/minecraft/sounds/SoundEvent;FF)V
+   invokevirtual net/minecraft/world/entity/animal/fox/Fox.playSound (Lnet/minecraft/sounds/SoundEvent;)V
    aload_0
    getfield net/minecraft/world/entity/animal/fox/Fox$FoxEatBerriesGoal.this$0 Lnet/minecraft/world/entity/animal/fox/Fox;
```

#### `Fox$FoxEatBerriesGoal.tick`

Tagged at `packages/entity-goals/src/goals/work.ts:507`.

```diff
    aload_0
    invokevirtual net/minecraft/world/entity/animal/fox/Fox$FoxEatBerriesGoal.onReachedTarget ()V
-   goto L33
+   goto L31
    aload_0
    dup
…
    iadd
    putfield net/minecraft/world/entity/animal/fox/Fox$FoxEatBerriesGoal.ticksWaited I
-   goto L33
+   goto L31
    aload_0
    invokevirtual net/minecraft/world/entity/animal/fox/Fox$FoxEatBerriesGoal.isReachedTarget ()Z
-   ifne L33
+   ifne L31
    aload_0
    getfield net/minecraft/world/entity/animal/fox/Fox$FoxEatBerriesGoal.this$0 Lnet/minecraft/world/entity/animal/fox/Fox;
…
    ldc float 0.05000000074505806
    fcmpg
-   ifge L33
+   ifge L31
    aload_0
    getfield net/minecraft/world/entity/animal/fox/Fox$FoxEatBerriesGoal.this$0 Lnet/minecraft/world/entity/animal/fox/Fox;
    getstatic net/minecraft/sounds/SoundEvents.FOX_SNIFF Lnet/minecraft/sounds/SoundEvent;
-   fconst_1
-   fconst_1
-   invokevirtual net/minecraft/world/entity/animal/fox/Fox.playSound (Lnet/minecraft/sounds/SoundEvent;FF)V
+   invokevirtual net/minecraft/world/entity/animal/fox/Fox.playSound (Lnet/minecraft/sounds/SoundEvent;)V
    aload_0
    invokespecial net/minecraft/world/entity/ai/goal/MoveToBlockGoal.tick ()V
```

#### `Fox$FoxPounceGoal.tick`

Tagged at `packages/entity-goals/src/goals/attacking.ts:1452`.

```diff
    ldc float 60
    ldc float 30
-   invokevirtual net/minecraft/world/entity/ai/control/LookControl.setLookAt (Lnet/minecraft/world/entity/Entity;FF)V
+   invokeinterface net/minecraft/world/entity/ai/control/LookControl.setLookAt (Lnet/minecraft/world/entity/Entity;FF)V
    aload_0
    getfield net/minecraft/world/entity/animal/fox/Fox$FoxPounceGoal.this$0 Lnet/minecraft/world/entity/animal/fox/Fox;
```

#### `IronGolem.doHurtTarget`

Tagged at `packages/prismarine/src/entity/data/EntityRuntime.ts:434`.

```diff
    istore 6
    iload 6
-   ifeq L71
+   ifeq L68
    aload_2
    instanceof net/minecraft/world/entity/LivingEntity
…
    dstore 9
    aload_2
-   aload_2
-   invokevirtual net/minecraft/world/entity/Entity.getDeltaMovement ()Lnet/minecraft/world/phys/Vec3;
    dconst_0
    ldc2_w double 0.4000000059604645
…
    dmul
    dconst_0
-   invokevirtual net/minecraft/world/phys/Vec3.add (DDD)Lnet/minecraft/world/phys/Vec3;
-   invokevirtual net/minecraft/world/entity/Entity.setDeltaMovement (Lnet/minecraft/world/phys/Vec3;)V
+   invokevirtual net/minecraft/world/entity/Entity.addDeltaMovement (DDD)V
    aload_1
    aload_2
…
    aload_0
    getstatic net/minecraft/sounds/SoundEvents.IRON_GOLEM_ATTACK Lnet/minecraft/sounds/SoundEvent;
-   fconst_1
-   fconst_1
-   invokevirtual net/minecraft/world/entity/animal/golem/IronGolem.playSound (Lnet/minecraft/sounds/SoundEvent;FF)V
+   invokevirtual net/minecraft/world/entity/animal/golem/IronGolem.playSound (Lnet/minecraft/sounds/SoundEvent;)V
    iload 6
    ireturn
```

#### `LadderBlock.getStateForPlacement`

Tagged at `packages/block-behaviors/src/rules/javaPlacement.ts:260`.

```diff
    astore 4
    aload_1
-   invokevirtual net/minecraft/world/item/context/BlockPlaceContext.getLevel ()Lnet/minecraft/world/level/Level;
-   aload_1
-   invokevirtual net/minecraft/world/item/context/BlockPlaceContext.getClickedPos ()Lnet/minecraft/core/BlockPos;
-   invokevirtual net/minecraft/world/level/Level.getFluidState (Lnet/minecraft/core/BlockPos;)Lnet/minecraft/world/level/material/FluidState;
+   invokevirtual net/minecraft/world/item/context/BlockPlaceContext.getClickedFluidState ()Lnet/minecraft/world/level/material/FluidState;
    astore 5
    aload_1
…
    iload 8
    iload 7
-   if_icmpge L82
+   if_icmpge L79
    aload 6
    iload 8
…
    invokevirtual net/minecraft/core/Direction.getAxis ()Lnet/minecraft/core/Direction$Axis;
    invokevirtual net/minecraft/core/Direction$Axis.isHorizontal ()Z
-   ifeq L80
+   ifeq L77
    aload_2
    getstatic net/minecraft/world/level/block/LadderBlock.FACING Lnet/minecraft/world/level/block/state/properties/EnumProperty;
…
    aload 4
    invokevirtual net/minecraft/world/level/block/state/BlockState.canSurvive (Lnet/minecraft/world/level/LevelReader;Lnet/minecraft/core/BlockPos;)Z
-   ifeq L80
+   ifeq L77
    aload_2
    getstatic net/minecraft/world/level/block/LadderBlock.WATERLOGGED Lnet/minecraft/world/level/block/state/properties/BooleanProperty;
    aload 5
    getstatic net/minecraft/world/level/material/Fluids.WATER Lnet/minecraft/world/level/material/FlowingFluid;
-   invokevirtual net/minecraft/world/level/material/FluidState.is (Ljava/lang/Object;)Z
+   invokevirtual net/minecraft/world/level/material/FluidState.isSourceOfType (Lnet/minecraft/world/level/material/Fluid;)Z
    invokestatic java/lang/Boolean.valueOf (Z)Ljava/lang/Boolean;
    invokevirtual net/minecraft/world/level/block/state/BlockState.setValue (Lnet/minecraft/world/level/block/state/properties/Property;Ljava/lang/Comparable;)Ljava/lang/Object;
…
    areturn
    iinc 8 1
-   goto L48
+   goto L45
    aconst_null
    areturn
```

#### `LanternBlock.getStateForPlacement`

Tagged at `packages/block-behaviors/src/families/furniture.ts:279`.

```diff
  method net/minecraft/world/level/block/LanternBlock.getStateForPlacement(Lnet/minecraft/world/item/context/BlockPlaceContext;)Lnet/minecraft/world/level/block/state/BlockState;
    aload_1
-   invokevirtual net/minecraft/world/item/context/BlockPlaceContext.getLevel ()Lnet/minecraft/world/level/Level;
-   aload_1
-   invokevirtual net/minecraft/world/item/context/BlockPlaceContext.getClickedPos ()Lnet/minecraft/core/BlockPos;
-   invokevirtual net/minecraft/world/level/Level.getFluidState (Lnet/minecraft/core/BlockPos;)Lnet/minecraft/world/level/material/FluidState;
+   invokevirtual net/minecraft/world/item/context/BlockPlaceContext.getClickedFluidState ()Lnet/minecraft/world/level/material/FluidState;
    astore_2
    aload_1
…
    iload 5
    iload 4
-   if_icmpge L56
+   if_icmpge L53
    aload_3
    iload 5
…
    invokevirtual net/minecraft/core/Direction.getAxis ()Lnet/minecraft/core/Direction$Axis;
    getstatic net/minecraft/core/Direction$Axis.Y Lnet/minecraft/core/Direction$Axis;
-   if_acmpne L54
+   if_acmpne L51
    aload_0
    invokevirtual net/minecraft/world/level/block/LanternBlock.defaultBlockState ()Lnet/minecraft/world/level/block/state/BlockState;
…
    aload 6
    getstatic net/minecraft/core/Direction.UP Lnet/minecraft/core/Direction;
-   if_acmpne L33
+   if_acmpne L30
    iconst_1
-   goto L34
+   goto L31
    iconst_0
    invokestatic java/lang/Boolean.valueOf (Z)Ljava/lang/Boolean;
…
    invokevirtual net/minecraft/world/item/context/BlockPlaceContext.getClickedPos ()Lnet/minecraft/core/BlockPos;
    invokevirtual net/minecraft/world/level/block/state/BlockState.canSurvive (Lnet/minecraft/world/level/LevelReader;Lnet/minecraft/core/BlockPos;)Z
-   ifeq L54
+   ifeq L51
    aload 7
    getstatic net/minecraft/world/level/block/LanternBlock.WATERLOGGED Lnet/minecraft/world/level/block/state/properties/BooleanProperty;
    aload_2
    getstatic net/minecraft/world/level/material/Fluids.WATER Lnet/minecraft/world/level/material/FlowingFluid;
-   invokevirtual net/minecraft/world/level/material/FluidState.is (Ljava/lang/Object;)Z
+   invokevirtual net/minecraft/world/level/material/FluidState.isSourceOfType (Lnet/minecraft/world/level/material/Fluid;)Z
    invokestatic java/lang/Boolean.valueOf (Z)Ljava/lang/Boolean;
    invokevirtual net/minecraft/world/level/block/state/BlockState.setValue (Lnet/minecraft/world/level/block/state/properties/Property;Ljava/lang/Comparable;)Ljava/lang/Object;
…
    areturn
    iinc 5 1
-   goto L14
+   goto L11
    aconst_null
    areturn
```

#### `Leashable.tickLeash`

Tagged at `packages/prismarine/src/entity/data/EntityRuntime.ts:2390`.

```diff
    astore_3
    aload_3
-   ifnull L127
+   ifnull L125
    aload_3
    invokevirtual net/minecraft/world/entity/Entity.level ()Lnet/minecraft/world/level/Level;
    aload_1
    invokevirtual net/minecraft/world/entity/Entity.level ()Lnet/minecraft/world/level/Level;
-   if_acmpne L127
+   if_acmpne L125
    aload_1
    checkcast net/minecraft/world/entity/Leashable
…
    invokeinterface net/minecraft/world/entity/Leashable.leashSnapDistance ()D
    dcmpl
-   ifle L82
+   ifle L80
    aload_0
    aconst_null
…
    getstatic net/minecraft/sounds/SoundEvents.LEAD_BREAK Lnet/minecraft/sounds/SoundEvent;
    getstatic net/minecraft/sounds/SoundSource.NEUTRAL Lnet/minecraft/sounds/SoundSource;
-   fconst_1
-   fconst_1
-   invokevirtual net/minecraft/server/level/ServerLevel.playSound (Lnet/minecraft/world/entity/Entity;DDDLnet/minecraft/sounds/SoundEvent;Lnet/minecraft/sounds/SoundSource;FF)V
+   invokevirtual net/minecraft/server/level/ServerLevel.playSound (Lnet/minecraft/world/entity/Entity;DDDLnet/minecraft/sounds/SoundEvent;Lnet/minecraft/sounds/SoundSource;)V
    aload_1
    checkcast net/minecraft/world/entity/Leashable
    invokeinterface net/minecraft/world/entity/Leashable.leashTooFarBehaviour ()V
-   goto L110
+   goto L108
    dload 4
    aload_1
…
    dsub
    dcmpl
-   ifle L106
+   ifle L104
    aload_1
    checkcast net/minecraft/world/entity/Leashable
…
    aload_2
    invokeinterface net/minecraft/world/entity/Leashable.checkElasticInteractions (Lnet/minecraft/world/entity/Entity;Lnet/minecraft/world/entity/Leashable$LeashData;)Z
-   ifeq L106
+   ifeq L104
    aload_1
    checkcast net/minecraft/world/entity/Leashable
    invokeinterface net/minecraft/world/entity/Leashable.onElasticLeashPull ()V
-   goto L110
+   goto L108
    aload_1
    checkcast net/minecraft/world/entity/Leashable
```

#### `LeavesBlock.getStateForPlacement`

Tagged at `packages/block-behaviors/src/rules/javaPlacement.ts:367`.

```diff
  method net/minecraft/world/level/block/LeavesBlock.getStateForPlacement(Lnet/minecraft/world/item/context/BlockPlaceContext;)Lnet/minecraft/world/level/block/state/BlockState;
    aload_1
-   invokevirtual net/minecraft/world/item/context/BlockPlaceContext.getLevel ()Lnet/minecraft/world/level/Level;
-   aload_1
-   invokevirtual net/minecraft/world/item/context/BlockPlaceContext.getClickedPos ()Lnet/minecraft/core/BlockPos;
-   invokevirtual net/minecraft/world/level/Level.getFluidState (Lnet/minecraft/core/BlockPos;)Lnet/minecraft/world/level/material/FluidState;
+   invokevirtual net/minecraft/world/item/context/BlockPlaceContext.getClickedFluidState ()Lnet/minecraft/world/level/material/FluidState;
    astore_2
    aload_0
…
    aload_2
    getstatic net/minecraft/world/level/material/Fluids.WATER Lnet/minecraft/world/level/material/FlowingFluid;
-   invokevirtual net/minecraft/world/level/material/FluidState.is (Ljava/lang/Object;)Z
+   invokevirtual net/minecraft/world/level/material/FluidState.isSourceOfType (Lnet/minecraft/world/level/material/Fluid;)Z
    invokestatic java/lang/Boolean.valueOf (Z)Ljava/lang/Boolean;
    invokevirtual net/minecraft/world/level/block/state/BlockState.setValue (Lnet/minecraft/world/level/block/state/properties/Property;Ljava/lang/Comparable;)Ljava/lang/Object;
```

#### `LightningRodBlock.getStateForPlacement`

Tagged at `packages/block-behaviors/src/rules/javaPlacement.ts:369`.

```diff
  method net/minecraft/world/level/block/LightningRodBlock.getStateForPlacement(Lnet/minecraft/world/item/context/BlockPlaceContext;)Lnet/minecraft/world/level/block/state/BlockState;
    aload_1
-   invokevirtual net/minecraft/world/item/context/BlockPlaceContext.getLevel ()Lnet/minecraft/world/level/Level;
-   aload_1
-   invokevirtual net/minecraft/world/item/context/BlockPlaceContext.getClickedPos ()Lnet/minecraft/core/BlockPos;
-   invokevirtual net/minecraft/world/level/Level.getFluidState (Lnet/minecraft/core/BlockPos;)Lnet/minecraft/world/level/material/FluidState;
+   invokevirtual net/minecraft/world/item/context/BlockPlaceContext.getClickedFluidState ()Lnet/minecraft/world/level/material/FluidState;
    astore_2
    aload_2
    getstatic net/minecraft/world/level/material/Fluids.WATER Lnet/minecraft/world/level/material/FlowingFluid;
-   invokevirtual net/minecraft/world/level/material/FluidState.is (Ljava/lang/Object;)Z
+   invokevirtual net/minecraft/world/level/material/FluidState.isSourceOfType (Lnet/minecraft/world/level/material/Fluid;)Z
    istore_3
    aload_0
```

#### `LivingEntity.aiStep`

Tagged at `packages/prismarine/src/entity/data/EntityRuntime.ts:7246`.

```diff
    aload_0
    getfield net/minecraft/world/entity/LivingEntity.jumping Z
-   ifeq L211
+   ifeq L170
    aload_0
    invokevirtual net/minecraft/world/entity/LivingEntity.isAffectedByFluids ()Z
-   ifeq L211
-   aload_0
-   invokevirtual net/minecraft/world/entity/LivingEntity.isInLava ()Z
-   ifeq L148
-   aload_0
-   getstatic net/minecraft/tags/FluidTags.LAVA Lnet/minecraft/tags/TagKey;
-   invokevirtual net/minecraft/world/entity/LivingEntity.getFluidHeight (Lnet/minecraft/tags/TagKey;)D
-   dstore 9
-   goto L152
-   aload_0
-   getstatic net/minecraft/tags/FluidTags.WATER Lnet/minecraft/tags/TagKey;
-   invokevirtual net/minecraft/world/entity/LivingEntity.getFluidHeight (Lnet/minecraft/tags/TagKey;)D
-   dstore 9
-   aload_0
-   invokevirtual net/minecraft/world/entity/LivingEntity.isInWater ()Z
-   ifeq L161
-   dload 9
-   dconst_0
-   dcmpl
-   ifle L161
-   iconst_1
-   goto L162
-   iconst_0
-   istore 11
-   aload_0
-   invokevirtual net/minecraft/world/entity/LivingEntity.getFluidJumpThreshold ()D
-   dstore 12
-   iload 11
-   ifeq L179
-   aload_0
-   invokevirtual net/minecraft/world/entity/LivingEntity.onGround ()Z
-   ifeq L175
-   dload 9
-   dload 12
-   dcmpl
-   ifle L179
-   aload_0
-   getstatic net/minecraft/tags/FluidTags.WATER Lnet/minecraft/tags/TagKey;
-   invokevirtual net/minecraft/world/entity/LivingEntity.jumpInLiquid (Lnet/minecraft/tags/TagKey;)V
-   goto L210
+   ifeq L170
    aload_0
-   invokevirtual net/minecraft/world/entity/LivingEntity.isInLava ()Z
-   ifeq L193
+   getfield net/minecraft/world/entity/LivingEntity.fluidInteraction Lnet/minecraft/world/entity/EntityFluidInteraction;
    aload_0
    invokevirtual net/minecraft/world/entity/LivingEntity.onGround ()Z
-   ifeq L189
+   ifeq L148
    aload_0
-   getstatic net/minecraft/tags/FluidTags.LAVA Lnet/minecraft/tags/TagKey;
-   invokevirtual net/minecraft/world/entity/LivingEntity.isInShallowFluid (Lnet/minecraft/tags/TagKey;)Z
-   ifne L193
+   invokevirtual net/minecraft/world/entity/LivingEntity.getFluidJumpThreshold ()D
```

223 more lines. `java:sources --list 'LivingEntity.aiStep'` prints the listing under each `--java`.

#### `LivingEntity.canBeAffected`

Tagged at `packages/prismarine/src/entity/data/EntityRuntime.ts:567`.

```diff
  method net/minecraft/world/entity/LivingEntity.canBeAffected(Lnet/minecraft/world/effect/MobEffectInstance;)Z
+   aload_1
+   getstatic net/minecraft/world/effect/MobEffects.INFESTED Lnet/minecraft/core/Holder;
+   invokevirtual net/minecraft/world/effect/MobEffectInstance.is (Lnet/minecraft/core/Holder;)Z
+   ifeq L10
    aload_0
    getstatic net/minecraft/tags/EntityTypeTags.IMMUNE_TO_INFESTED Lnet/minecraft/tags/TagKey;
    invokevirtual net/minecraft/world/entity/LivingEntity.is (Lnet/minecraft/tags/TagKey;)Z
-   ifeq L12
+   ifeq L10
+   iconst_0
+   ireturn
    aload_1
-   getstatic net/minecraft/world/effect/MobEffects.INFESTED Lnet/minecraft/core/Holder;
+   getstatic net/minecraft/world/effect/MobEffects.FREEZING Lnet/minecraft/core/Holder;
    invokevirtual net/minecraft/world/effect/MobEffectInstance.is (Lnet/minecraft/core/Holder;)Z
-   ifne L10
-   iconst_1
-   goto L11
+   ifeq L20
+   aload_0
+   getstatic net/minecraft/tags/EntityTypeTags.IMMUNE_TO_FREEZING Lnet/minecraft/tags/TagKey;
+   invokevirtual net/minecraft/world/entity/LivingEntity.is (Lnet/minecraft/tags/TagKey;)Z
+   ifeq L20
    iconst_0
    ireturn
+   aload_1
+   getstatic net/minecraft/world/effect/MobEffects.OOZING Lnet/minecraft/core/Holder;
+   invokevirtual net/minecraft/world/effect/MobEffectInstance.is (Lnet/minecraft/core/Holder;)Z
+   ifeq L30
    aload_0
    getstatic net/minecraft/tags/EntityTypeTags.IMMUNE_TO_OOZING Lnet/minecraft/tags/TagKey;
    invokevirtual net/minecraft/world/entity/LivingEntity.is (Lnet/minecraft/tags/TagKey;)Z
-   ifeq L24
+   ifeq L30
+   iconst_0
+   ireturn
    aload_1
-   getstatic net/minecraft/world/effect/MobEffects.OOZING Lnet/minecraft/core/Holder;
+   getstatic net/minecraft/world/effect/MobEffects.REGENERATION Lnet/minecraft/core/Holder;
    invokevirtual net/minecraft/world/effect/MobEffectInstance.is (Lnet/minecraft/core/Holder;)Z
-   ifne L22
-   iconst_1
-   goto L23
+   ifeq L40
+   aload_0
+   getstatic net/minecraft/tags/EntityTypeTags.IMMUNE_TO_REGENERATION Lnet/minecraft/tags/TagKey;
+   invokevirtual net/minecraft/world/entity/LivingEntity.is (Lnet/minecraft/tags/TagKey;)Z
+   ifeq L40
    iconst_0
    ireturn
+   aload_1
+   getstatic net/minecraft/world/effect/MobEffects.POISON Lnet/minecraft/core/Holder;
+   invokevirtual net/minecraft/world/effect/MobEffectInstance.is (Lnet/minecraft/core/Holder;)Z
+   ifeq L50
    aload_0
-   getstatic net/minecraft/tags/EntityTypeTags.IGNORES_POISON_AND_REGEN Lnet/minecraft/tags/TagKey;
+   getstatic net/minecraft/tags/EntityTypeTags.IMMUNE_TO_POISON Lnet/minecraft/tags/TagKey;
    invokevirtual net/minecraft/world/entity/LivingEntity.is (Lnet/minecraft/tags/TagKey;)Z
-   ifeq L40
```

29 more lines. `java:sources --list 'LivingEntity.canBeAffected'` prints the listing under each `--java`.

#### `LivingEntity.computeModifiedFriction`

Tagged at `packages/prismarine/src/entity/data/EntityRuntime.ts:539`.

```diff
    fconst_0
    fconst_1
-   invokestatic net/minecraft/util/Mth.clamp (FFF)F
+   invokestatic java/lang/Math.clamp (FFF)F
    freturn
```

#### `LivingEntity.handleOnClimbable`

Tagged at `packages/prismarine/src/entity/data/EntityRuntime.ts:8760`.

```diff
    ldc2_w double -0.15000000596046448
    ldc2_w double 0.15000000596046448
-   invokestatic net/minecraft/util/Mth.clamp (DDD)D
+   invokestatic java/lang/Math.clamp (DDD)D
    dstore_3
    aload_1
…
    ldc2_w double -0.15000000596046448
    ldc2_w double 0.15000000596046448
-   invokestatic net/minecraft/util/Mth.clamp (DDD)D
+   invokestatic java/lang/Math.clamp (DDD)D
    dstore 5
    aload_1
```

#### `LivingEntity.hurtServer`

Tagged at `packages/prismarine/src/entity/data/EntityRuntime.ts:4258`.

```diff
    aload_2
    fload_3
-   invokevirtual net/minecraft/world/entity/LivingEntity.applyItemBlocking (Lnet/minecraft/server/level/ServerLevel;Lnet/minecraft/world/damagesource/DamageSource;F)F
-   fstore 6
+   invokevirtual net/minecraft/world/entity/LivingEntity.applyItemBlocking (Lnet/minecraft/server/level/ServerLevel;Lnet/minecraft/world/damagesource/DamageSource;F)Ljava/util/Optional;
+   astore 6
+   aload 6
+   invokevirtual java/util/Optional.isPresent ()Z
+   istore 7
+   iload 7
+   ifeq L59
    fload_3
-   fload 6
+   aload 6
+   invokevirtual java/util/Optional.get ()Ljava/lang/Object;
+   checkcast java/lang/Float
+   invokevirtual java/lang/Float.floatValue ()F
    fsub
    fstore_3
-   fload 6
-   fconst_0
-   fcmpl
-   ifle L57
-   iconst_1
-   goto L58
-   iconst_0
-   istore 7
    aload_2
    getstatic net/minecraft/tags/DamageTypeTags.IS_FREEZING Lnet/minecraft/tags/TagKey;
…
    istore 9
    iload 9
-   ifeq L273
+   ifeq L268
    aload_0
    aload_2
-   putfield net/minecraft/world/entity/LivingEntity.lastDamageSource Lnet/minecraft/world/damagesource/DamageSource;
-   aload_0
-   aload_0
-   invokevirtual net/minecraft/world/entity/LivingEntity.level ()Lnet/minecraft/world/level/Level;
-   invokevirtual net/minecraft/world/level/Level.getGameTime ()J
-   putfield net/minecraft/world/entity/LivingEntity.lastDamageStamp J
+   invokevirtual net/minecraft/world/entity/LivingEntity.setLastDamageSource (Lnet/minecraft/world/damagesource/DamageSource;)V
    aload_0
    invokevirtual net/minecraft/world/entity/LivingEntity.getActiveEffects ()Ljava/util/Collection;
…
    aload 10
    invokeinterface java/util/Iterator.hasNext ()Z
-   ifeq L273
+   ifeq L268
    aload 10
    invokeinterface java/util/Iterator.next ()Ljava/lang/Object;
…
    fload_3
    invokevirtual net/minecraft/world/effect/MobEffectInstance.onMobHurt (Lnet/minecraft/server/level/ServerLevel;Lnet/minecraft/world/entity/LivingEntity;Lnet/minecraft/world/damagesource/DamageSource;F)V
-   goto L259
+   goto L254
    aload_0
    astore 11
…
```

46 more lines. `java:sources --list 'LivingEntity.hurtServer'` prints the listing under each `--java`.

#### `LivingEntity.tick`

Tagged at `packages/prismarine/src/entity/data/EntityRuntime.ts:380`, `packages/prismarine/src/entity/data/EntityRuntime.ts:4150`.

```diff
    return
  inlined net/minecraft/world/entity/LivingEntity.handleEquipmentChanges(Ljava/util/Map;)V
+   new java/util/ArrayList
+   dup
    aload_1
    invokeinterface java/util/Map.size ()I
-   invokestatic com/google/common/collect/Lists.newArrayListWithCapacity (I)Ljava/util/ArrayList;
+   invokespecial java/util/ArrayList.<init> (I)V
    astore_2
    aload_1
```

#### `LivingEntity.travel`

Tagged at `packages/prismarine/src/entity/data/travel.ts:49`.

```diff
    aload_0
    getfield net/minecraft/world/entity/LivingEntity.horizontalCollision Z
-   ifeq L32
+   ifeq L30
    dload_1
    dload_3
…
    fconst_0
    fcmpl
-   ifle L32
+   ifle L30
    aload_0
    aload_0
…
    f2i
    invokevirtual net/minecraft/world/entity/LivingEntity.getFallDamageSound (I)Lnet/minecraft/sounds/SoundEvent;
-   fconst_1
-   fconst_1
-   invokevirtual net/minecraft/world/entity/LivingEntity.playSound (Lnet/minecraft/sounds/SoundEvent;FF)V
+   invokevirtual net/minecraft/world/entity/LivingEntity.playSound (Lnet/minecraft/sounds/SoundEvent;)V
    aload_0
    aload_0
…
    fconst_0
    fconst_1
-   invokestatic net/minecraft/util/Mth.clamp (FFF)F
+   invokestatic java/lang/Math.clamp (FFF)F
    freturn
  inlined net/minecraft/world/entity/LivingEntity.handleRelativeFrictionAndCalculateMovement(Lnet/minecraft/world/phys/Vec3;F)Lnet/minecraft/world/phys/Vec3;
…
    ldc2_w double -0.15000000596046448
    ldc2_w double 0.15000000596046448
-   invokestatic net/minecraft/util/Mth.clamp (DDD)D
+   invokestatic java/lang/Math.clamp (DDD)D
    dstore_3
    aload_1
…
    ldc2_w double -0.15000000596046448
    ldc2_w double 0.15000000596046448
-   invokestatic net/minecraft/util/Mth.clamp (DDD)D
+   invokestatic java/lang/Math.clamp (DDD)D
    dstore 5
    aload_1
```

#### `Llama.handleEating`

Tagged at `packages/prismarine/src/entity/javaBabyFood.ts:40`.

```diff
    invokevirtual net/minecraft/world/entity/animal/equine/Llama.setInLove (Lnet/minecraft/world/entity/player/Player;)V
    aload_0
-   invokevirtual net/minecraft/world/entity/animal/equine/Llama.getHealth ()F
-   aload_0
-   invokevirtual net/minecraft/world/entity/animal/equine/Llama.getMaxHealth ()F
-   fcmpg
-   ifge L58
+   invokevirtual net/minecraft/world/entity/animal/equine/Llama.canHealNaturally ()Z
+   ifeq L55
    fload 5
    fconst_0
    fcmpl
-   ifle L58
+   ifle L55
    aload_0
    fload 5
-   invokevirtual net/minecraft/world/entity/animal/equine/Llama.heal (F)V
+   invokevirtual net/minecraft/world/entity/animal/equine/Llama.healNaturally (F)V
    iconst_1
    istore 6
    aload_0
    invokevirtual net/minecraft/world/entity/animal/equine/Llama.isBaby ()Z
-   ifeq L92
+   ifeq L89
    iload_3
-   ifle L92
+   ifle L89
    aload_0
    invokevirtual net/minecraft/world/entity/animal/equine/Llama.isAgeLocked ()Z
-   ifne L92
+   ifne L89
    aload_0
    invokevirtual net/minecraft/world/entity/animal/equine/Llama.level ()Lnet/minecraft/world/level/Level;
…
    invokevirtual net/minecraft/world/entity/animal/equine/Llama.level ()Lnet/minecraft/world/level/Level;
    invokevirtual net/minecraft/world/level/Level.isClientSide ()Z
-   ifne L92
+   ifne L89
    aload_0
    iload_3
…
    istore 6
    iload 4
-   ifle L114
+   ifle L111
    iload 6
-   ifne L99
+   ifne L96
    aload_0
    invokevirtual net/minecraft/world/entity/animal/equine/Llama.isTamed ()Z
-   ifne L114
+   ifne L111
    aload_0
    invokevirtual net/minecraft/world/entity/animal/equine/Llama.getTemper ()I
    aload_0
    invokevirtual net/minecraft/world/entity/animal/equine/Llama.getMaxTemper ()I
-   if_icmpge L114
+   if_icmpge L111
    aload_0
    invokevirtual net/minecraft/world/entity/animal/equine/Llama.level ()Lnet/minecraft/world/level/Level;
```

22 more lines. `java:sources --list 'Llama.handleEating'` prints the listing under each `--java`.

#### `LootTable.shuffleAndSplitItems`

Tagged at `packages/prismarine/src/inventory/containerLoot.ts:88`.

```diff
  method net/minecraft/world/level/storage/loot/LootTable.shuffleAndSplitItems(Lit/unimi/dsi/fastutil/objects/ObjectArrayList;ILnet/minecraft/util/RandomSource;)V
-   invokestatic com/google/common/collect/Lists.newArrayList ()Ljava/util/ArrayList;
+   new java/util/ArrayList
+   dup
+   invokespecial java/util/ArrayList.<init> ()V
    astore 4
    aload_1
…
    aload 5
    invokeinterface java/util/Iterator.hasNext ()Z
-   ifeq L29
+   ifeq L31
    aload 5
    invokeinterface java/util/Iterator.next ()Ljava/lang/Object;
…
    aload 6
    invokevirtual net/minecraft/world/item/ItemStack.isEmpty ()Z
-   ifeq L18
+   ifeq L20
    aload 5
    invokeinterface java/util/Iterator.remove ()V
-   goto L28
+   goto L30
    aload 6
    invokevirtual net/minecraft/world/item/ItemStack.getCount ()I
    iconst_1
-   if_icmple L28
+   if_icmple L30
    aload 4
    aload 6
…
    aload 5
    invokeinterface java/util/Iterator.remove ()V
-   goto L5
+   goto L7
    iload_2
    aload_1
…
    invokeinterface java/util/List.size ()I
    isub
-   ifle L96
+   ifle L98
    aload 4
    invokeinterface java/util/List.isEmpty ()Z
-   ifne L96
+   ifne L98
    aload 4
    aload_3
…
    invokevirtual net/minecraft/world/item/ItemStack.getCount ()I
    iconst_1
-   if_icmple L75
+   if_icmple L77
    aload_3
    invokeinterface net/minecraft/util/RandomSource.nextBoolean ()Z
-   ifeq L75
+   ifeq L77
    aload 4
    aload 5
    invokeinterface java/util/List.add (Ljava/lang/Object;)Z
```

28 more lines. `java:sources --list 'LootTable.shuffleAndSplitItems'` prints the listing under each `--java`.

#### `MangrovePropaguleBlock.getStateForPlacement`

Tagged at `packages/block-behaviors/src/rules/javaPlacement.ts:388`.

```diff
  method net/minecraft/world/level/block/MangrovePropaguleBlock.getStateForPlacement(Lnet/minecraft/world/item/context/BlockPlaceContext;)Lnet/minecraft/world/level/block/state/BlockState;
    aload_1
-   invokevirtual net/minecraft/world/item/context/BlockPlaceContext.getLevel ()Lnet/minecraft/world/level/Level;
-   aload_1
-   invokevirtual net/minecraft/world/item/context/BlockPlaceContext.getClickedPos ()Lnet/minecraft/core/BlockPos;
-   invokevirtual net/minecraft/world/level/Level.getFluidState (Lnet/minecraft/core/BlockPos;)Lnet/minecraft/world/level/material/FluidState;
+   invokevirtual net/minecraft/world/item/context/BlockPlaceContext.getClickedFluidState ()Lnet/minecraft/world/level/material/FluidState;
    astore_2
    aload_2
    getstatic net/minecraft/world/level/material/Fluids.WATER Lnet/minecraft/world/level/material/FlowingFluid;
-   invokevirtual net/minecraft/world/level/material/FluidState.is (Ljava/lang/Object;)Z
+   invokevirtual net/minecraft/world/level/material/FluidState.isSourceOfType (Lnet/minecraft/world/level/material/Fluid;)Z
    istore_3
    aload_0
```

#### `MapItemSavedData.createFresh`

Tagged at `packages/prismarine/src/world/savedMap.ts:73`, `packages/prismarine/src/world/savedMap.ts:212`.

```diff
    putfield net/minecraft/world/level/saveddata/maps/MapItemSavedData.colors [B
    aload_0
-   invokestatic com/google/common/collect/Lists.newArrayList ()Ljava/util/ArrayList;
+   new java/util/ArrayList
+   dup
+   invokespecial java/util/ArrayList.<init> ()V
    putfield net/minecraft/world/level/saveddata/maps/MapItemSavedData.carriedBy Ljava/util/List;
    aload_0
-   invokestatic com/google/common/collect/Maps.newHashMap ()Ljava/util/HashMap;
+   new java/util/HashMap
+   dup
+   invokespecial java/util/HashMap.<init> ()V
    putfield net/minecraft/world/level/saveddata/maps/MapItemSavedData.carriedByPlayers Ljava/util/Map;
    aload_0
-   invokestatic com/google/common/collect/Maps.newHashMap ()Ljava/util/HashMap;
+   new java/util/HashMap
+   dup
+   invokespecial java/util/HashMap.<init> ()V
    putfield net/minecraft/world/level/saveddata/maps/MapItemSavedData.bannerMarkers Ljava/util/Map;
    aload_0
-   invokestatic com/google/common/collect/Maps.newLinkedHashMap ()Ljava/util/LinkedHashMap;
+   new java/util/LinkedHashMap
+   dup
+   invokespecial java/util/LinkedHashMap.<init> ()V
    putfield net/minecraft/world/level/saveddata/maps/MapItemSavedData.decorations Ljava/util/Map;
    aload_0
-   invokestatic com/google/common/collect/Maps.newHashMap ()Ljava/util/HashMap;
+   new java/util/HashMap
+   dup
+   invokespecial java/util/HashMap.<init> ()V
    putfield net/minecraft/world/level/saveddata/maps/MapItemSavedData.frameMarkers Ljava/util/Map;
    aload_0
```

#### `Mth.cos`

Tagged at `packages/entity-goals/src/javaMth.ts:36`.

```diff
  method net/minecraft/util/Mth.cos(D)F
+   dload_0
+   dconst_0
+   dcmpl
+   iflt L18
    getstatic net/minecraft/util/Mth.SIN [F
    dload_0
…
    ldc2_w double 16384
    dadd
+   ldc2_w double 0.5
+   dadd
    d2l
    ldc2_w long 65535
…
    faload
    freturn
+   getstatic net/minecraft/util/Mth.SIN [F
+   dload_0
+   dneg
+   ldc2_w double 10430.378350470453
+   dmul
+   ldc2_w double 16384
+   dadd
+   ldc2_w double 0.5
+   dadd
+   d2l
+   ldc2_w long 65535
+   land
+   l2i
+   faload
+   freturn
```

#### `Mth.outFromOrigin(IIII)Ljava/util/stream/IntStream;`

Tagged at `packages/prismarine/src/world/generators/datadriven/biomeSearch.ts:94`.

```diff
    athrow
    iload_0
+   i2l
    iload_1
    iload_2
-   invokestatic net/minecraft/util/Mth.clamp (III)I
+   invokestatic java/lang/Math.clamp (JII)I
    istore 4
    iload 4
```

#### `Mth.sin`

Tagged at `packages/entity-goals/src/javaMth.ts:28`.

```diff
  method net/minecraft/util/Mth.sin(D)F
+   dload_0
+   dconst_0
+   dcmpl
+   iflt L16
    getstatic net/minecraft/util/Mth.SIN [F
    dload_0
    ldc2_w double 10430.378350470453
    dmul
+   ldc2_w double 0.5
+   dadd
    d2l
    ldc2_w long 65535
…
    faload
    freturn
+   getstatic net/minecraft/util/Mth.SIN [F
+   dload_0
+   dneg
+   ldc2_w double 10430.378350470453
+   dmul
+   ldc2_w double 0.5
+   dadd
+   d2l
+   ldc2_w long 65535
+   land
+   l2i
+   faload
+   fneg
+   freturn
```

#### `MushroomBlock.canSurvive`

Tagged at `packages/block-behaviors/src/families/plants.ts:169`, `packages/block-behaviors/src/families/plants.ts:183`.

```diff
  method net/minecraft/world/level/block/MushroomBlock.canSurvive(Lnet/minecraft/world/level/block/state/BlockState;Lnet/minecraft/world/level/LevelReader;Lnet/minecraft/core/BlockPos;)Z
-   aload_3
-   invokevirtual net/minecraft/core/BlockPos.below ()Lnet/minecraft/core/BlockPos;
-   astore 4
    aload_2
-   aload 4
-   invokeinterface net/minecraft/world/level/LevelReader.getBlockState (Lnet/minecraft/core/BlockPos;)Lnet/minecraft/world/level/block/state/BlockState;
-   astore 5
-   aload 5
-   getstatic net/minecraft/tags/BlockTags.OVERRIDES_MUSHROOM_LIGHT_REQUIREMENT Lnet/minecraft/tags/TagKey;
-   invokevirtual net/minecraft/world/level/block/state/BlockState.is (Lnet/minecraft/tags/TagKey;)Z
-   ifeq L13
-   iconst_1
-   ireturn
-   aload_2
    aload_3
-   iconst_0
-   invokeinterface net/minecraft/world/level/LevelReader.getRawBrightness (Lnet/minecraft/core/BlockPos;I)I
-   bipush 13
-   if_icmpge L27
-   aload_0
-   aload 5
-   aload_2
-   aload 4
-   invokevirtual net/minecraft/world/level/block/MushroomBlock.mayPlaceOn (Lnet/minecraft/world/level/block/state/BlockState;Lnet/minecraft/world/level/BlockGetter;Lnet/minecraft/core/BlockPos;)Z
-   ifeq L27
-   iconst_1
-   goto L28
-   iconst_0
+   invokestatic net/minecraft/world/level/block/MushroomBlock.canSupportCenter (Lnet/minecraft/world/level/LevelReader;Lnet/minecraft/core/BlockPos;)Z
    ireturn
```

#### `Painting.create`

Tagged at `packages/prismarine/src/entity/data/hangingEntities.ts:192`, `packages/prismarine/src/entity/data/paintings.ts:62`.

```diff
    invokevirtual net/minecraft/world/entity/decoration/painting/Painting.setVariant (Lnet/minecraft/core/Holder;)V
    aload_0
-   invokevirtual net/minecraft/world/entity/decoration/painting/Painting.survives ()Z
+   invokevirtual net/minecraft/world/entity/decoration/painting/Painting.canBePlaced ()Z
    ifne L8
    iconst_1
```

#### `Player.aiStep`

Tagged at `packages/prismarine/src/entity/data/experienceOrbs.ts:423`, `packages/prismarine/src/entity/playerHunger.ts:84`, `packages/prismarine/src/entity/playerHunger.ts:91`, `packages/prismarine/src/entity/playerHunger.ts:287`.

```diff
    fconst_0
    fcmpl
-   ifle L113
+   ifle L115
    aload_0
    invokevirtual net/minecraft/world/entity/player/Player.isSpectator ()Z
-   ifne L113
+   ifne L115
    aload_0
    invokevirtual net/minecraft/world/entity/player/Player.isPassenger ()Z
…
    invokevirtual net/minecraft/world/level/Level.getEntities (Lnet/minecraft/world/entity/Entity;Lnet/minecraft/world/phys/AABB;)Ljava/util/List;
    astore_2
-   invokestatic com/google/common/collect/Lists.newArrayList ()Ljava/util/ArrayList;
+   new java/util/ArrayList
+   dup
+   invokespecial java/util/ArrayList.<init> ()V
    astore_3
    aload_2
…
    aload 4
    invokeinterface java/util/Iterator.hasNext ()Z
-   ifeq L103
+   ifeq L105
    aload 4
    invokeinterface java/util/Iterator.next ()Ljava/lang/Object;
…
    getstatic net/minecraft/world/entity/EntityTypes.EXPERIENCE_ORB Lnet/minecraft/world/entity/EntityType;
    invokevirtual net/minecraft/world/entity/Entity.is (Ljava/lang/Object;)Z
-   ifeq L96
+   ifeq L98
    aload_3
    aload 5
    invokeinterface java/util/List.add (Ljava/lang/Object;)Z
    pop
-   goto L102
+   goto L104
    aload 5
    invokevirtual net/minecraft/world/entity/Entity.isRemoved ()Z
-   ifne L102
+   ifne L104
    aload_0
    aload 5
    invokevirtual net/minecraft/world/entity/player/Player.touch (Lnet/minecraft/world/entity/Entity;)V
-   goto L80
+   goto L82
    aload_3
    invokeinterface java/util/List.isEmpty ()Z
-   ifne L113
+   ifne L115
    aload_0
    aload_3
```

#### `Player.hurtServer`

Tagged at `packages/prismarine/src/entity/Difficulty.ts:16`.

```diff
    fconst_0
    fcmpl
-   ifne L64
+   ifne L73
+   aload_2
+   invokevirtual net/minecraft/world/damagesource/DamageSource.getWeaponItem ()Lnet/minecraft/world/item/ItemStack;
+   astore 4
+   aload 4
+   ifnull L71
+   aload 4
+   getstatic net/minecraft/tags/ItemTags.KNOCKS_BACK_PLAYERS_EVEN_WITH_ZERO_DAMAGE Lnet/minecraft/tags/TagKey;
+   invokevirtual net/minecraft/world/item/ItemStack.is (Lnet/minecraft/tags/TagKey;)Z
+   ifne L73
    iconst_0
    ireturn
```

#### `PlayerList.respawn`

Tagged at `packages/prismarine/src/player/PlayerSession.ts:2961`.

```diff
    new net/minecraft/network/protocol/game/ClientboundSoundPacket
    dup
-   getstatic net/minecraft/sounds/SoundEvents.RESPAWN_ANCHOR_DEPLETE Lnet/minecraft/core/Holder$Reference;
+   getstatic net/minecraft/sounds/SoundEvents.RESPAWN_ANCHOR_DEPLETE Lnet/minecraft/core/Holder;
    getstatic net/minecraft/sounds/SoundSource.BLOCKS Lnet/minecraft/sounds/SoundSource;
    aload 14
```

#### `PoiTypes.HOME`

Tagged at `packages/prismarine/src/entity/data/poi.ts:140`.

```diff
- field net/minecraft/world/entity/ai/village/poi/PoiTypes.HOME Lnet/minecraft/resources/ResourceKey;
+ field net/minecraft/world/entity/ai/village/poi/PoiTypes.HOME Lnet/minecraft/core/Holder;
  inlined net/minecraft/world/entity/ai/village/poi/PoiTypes.<clinit>()V
-   ldc string "armorer"
-   invokestatic net/minecraft/world/entity/ai/village/poi/PoiTypes.createKey (Ljava/lang/String;)Lnet/minecraft/resources/ResourceKey;
-   putstatic net/minecraft/world/entity/ai/village/poi/PoiTypes.ARMORER Lnet/minecraft/resources/ResourceKey;
-   ldc string "butcher"
-   invokestatic net/minecraft/world/entity/ai/village/poi/PoiTypes.createKey (Ljava/lang/String;)Lnet/minecraft/resources/ResourceKey;
-   putstatic net/minecraft/world/entity/ai/village/poi/PoiTypes.BUTCHER Lnet/minecraft/resources/ResourceKey;
-   ldc string "cartographer"
-   invokestatic net/minecraft/world/entity/ai/village/poi/PoiTypes.createKey (Ljava/lang/String;)Lnet/minecraft/resources/ResourceKey;
-   putstatic net/minecraft/world/entity/ai/village/poi/PoiTypes.CARTOGRAPHER Lnet/minecraft/resources/ResourceKey;
-   ldc string "cleric"
-   invokestatic net/minecraft/world/entity/ai/village/poi/PoiTypes.createKey (Ljava/lang/String;)Lnet/minecraft/resources/ResourceKey;
-   putstatic net/minecraft/world/entity/ai/village/poi/PoiTypes.CLERIC Lnet/minecraft/resources/ResourceKey;
-   ldc string "farmer"
-   invokestatic net/minecraft/world/entity/ai/village/poi/PoiTypes.createKey (Ljava/lang/String;)Lnet/minecraft/resources/ResourceKey;
-   putstatic net/minecraft/world/entity/ai/village/poi/PoiTypes.FARMER Lnet/minecraft/resources/ResourceKey;
-   ldc string "fisherman"
-   invokestatic net/minecraft/world/entity/ai/village/poi/PoiTypes.createKey (Ljava/lang/String;)Lnet/minecraft/resources/ResourceKey;
-   putstatic net/minecraft/world/entity/ai/village/poi/PoiTypes.FISHERMAN Lnet/minecraft/resources/ResourceKey;
-   ldc string "fletcher"
-   invokestatic net/minecraft/world/entity/ai/village/poi/PoiTypes.createKey (Ljava/lang/String;)Lnet/minecraft/resources/ResourceKey;
-   putstatic net/minecraft/world/entity/ai/village/poi/PoiTypes.FLETCHER Lnet/minecraft/resources/ResourceKey;
-   ldc string "leatherworker"
-   invokestatic net/minecraft/world/entity/ai/village/poi/PoiTypes.createKey (Ljava/lang/String;)Lnet/minecraft/resources/ResourceKey;
-   putstatic net/minecraft/world/entity/ai/village/poi/PoiTypes.LEATHERWORKER Lnet/minecraft/resources/ResourceKey;
-   ldc string "librarian"
-   invokestatic net/minecraft/world/entity/ai/village/poi/PoiTypes.createKey (Ljava/lang/String;)Lnet/minecraft/resources/ResourceKey;
-   putstatic net/minecraft/world/entity/ai/village/poi/PoiTypes.LIBRARIAN Lnet/minecraft/resources/ResourceKey;
-   ldc string "mason"
-   invokestatic net/minecraft/world/entity/ai/village/poi/PoiTypes.createKey (Ljava/lang/String;)Lnet/minecraft/resources/ResourceKey;
-   putstatic net/minecraft/world/entity/ai/village/poi/PoiTypes.MASON Lnet/minecraft/resources/ResourceKey;
-   ldc string "shepherd"
-   invokestatic net/minecraft/world/entity/ai/village/poi/PoiTypes.createKey (Ljava/lang/String;)Lnet/minecraft/resources/ResourceKey;
-   putstatic net/minecraft/world/entity/ai/village/poi/PoiTypes.SHEPHERD Lnet/minecraft/resources/ResourceKey;
-   ldc string "toolsmith"
-   invokestatic net/minecraft/world/entity/ai/village/poi/PoiTypes.createKey (Ljava/lang/String;)Lnet/minecraft/resources/ResourceKey;
-   putstatic net/minecraft/world/entity/ai/village/poi/PoiTypes.TOOLSMITH Lnet/minecraft/resources/ResourceKey;
-   ldc string "weaponsmith"
-   invokestatic net/minecraft/world/entity/ai/village/poi/PoiTypes.createKey (Ljava/lang/String;)Lnet/minecraft/resources/ResourceKey;
-   putstatic net/minecraft/world/entity/ai/village/poi/PoiTypes.WEAPONSMITH Lnet/minecraft/resources/ResourceKey;
-   ldc string "home"
-   invokestatic net/minecraft/world/entity/ai/village/poi/PoiTypes.createKey (Ljava/lang/String;)Lnet/minecraft/resources/ResourceKey;
-   putstatic net/minecraft/world/entity/ai/village/poi/PoiTypes.HOME Lnet/minecraft/resources/ResourceKey;
-   ldc string "meeting"
-   invokestatic net/minecraft/world/entity/ai/village/poi/PoiTypes.createKey (Ljava/lang/String;)Lnet/minecraft/resources/ResourceKey;
-   putstatic net/minecraft/world/entity/ai/village/poi/PoiTypes.MEETING Lnet/minecraft/resources/ResourceKey;
-   ldc string "beehive"
-   invokestatic net/minecraft/world/entity/ai/village/poi/PoiTypes.createKey (Ljava/lang/String;)Lnet/minecraft/resources/ResourceKey;
-   putstatic net/minecraft/world/entity/ai/village/poi/PoiTypes.BEEHIVE Lnet/minecraft/resources/ResourceKey;
-   ldc string "bee_nest"
-   invokestatic net/minecraft/world/entity/ai/village/poi/PoiTypes.createKey (Ljava/lang/String;)Lnet/minecraft/resources/ResourceKey;
-   putstatic net/minecraft/world/entity/ai/village/poi/PoiTypes.BEE_NEST Lnet/minecraft/resources/ResourceKey;
-   ldc string "nether_portal"
-   invokestatic net/minecraft/world/entity/ai/village/poi/PoiTypes.createKey (Ljava/lang/String;)Lnet/minecraft/resources/ResourceKey;
-   putstatic net/minecraft/world/entity/ai/village/poi/PoiTypes.NETHER_PORTAL Lnet/minecraft/resources/ResourceKey;
-   ldc string "lodestone"
-   invokestatic net/minecraft/world/entity/ai/village/poi/PoiTypes.createKey (Ljava/lang/String;)Lnet/minecraft/resources/ResourceKey;
-   putstatic net/minecraft/world/entity/ai/village/poi/PoiTypes.LODESTONE Lnet/minecraft/resources/ResourceKey;
```

228 more lines. `java:sources --list 'PoiTypes.HOME'` prints the listing under each `--java`.

#### `PortalForcer.createPortal`

Tagged at `packages/block-behaviors/src/rules/portal.ts:561`, `packages/prismarine/src/world/portal/create.ts:28`.

```diff
    ldc2_w double -1
    dcmpl
-   ifne L309
+   ifne L310
    aload_0
    getfield net/minecraft/world/level/portal/PortalForcer.level Lnet/minecraft/server/level/ServerLevel;
…
    aload_1
    invokevirtual net/minecraft/core/BlockPos.getY ()I
+   i2l
    iload 14
    iload 15
-   invokestatic net/minecraft/util/Mth.clamp (III)I
+   invokestatic java/lang/Math.clamp (JII)I
    aload_1
    invokevirtual net/minecraft/core/BlockPos.getZ ()I
…
    iload 17
    iconst_2
-   if_icmpge L309
+   if_icmpge L310
    iconst_0
    istore 18
    iload 18
    iconst_2
-   if_icmpge L307
+   if_icmpge L308
    iconst_m1
    istore 19
    iload 19
    iconst_3
-   if_icmpge L305
+   if_icmpge L306
    iload 19
-   ifge L271
+   ifge L272
    getstatic net/minecraft/world/level/block/Blocks.OBSIDIAN Lnet/minecraft/world/level/block/Block;
    invokevirtual net/minecraft/world/level/block/Block.defaultBlockState ()Lnet/minecraft/world/level/block/state/BlockState;
-   goto L273
+   goto L274
    getstatic net/minecraft/world/level/block/Blocks.AIR Lnet/minecraft/world/level/block/Block;
    invokevirtual net/minecraft/world/level/block/Block.defaultBlockState ()Lnet/minecraft/world/level/block/state/BlockState;
…
    pop
    iinc 19 1
-   goto L263
+   goto L264
    iinc 18 1
-   goto L258
+   goto L259
    iinc 17 1
-   goto L253
+   goto L254
    iconst_m1
    istore 14
    iload 14
    iconst_3
-   if_icmpge L355
+   if_icmpge L356
    iconst_m1
```

56 more lines. `java:sources --list 'PortalForcer.createPortal'` prints the listing under each `--java`.

#### `PortalForcer.findClosestPortalPosition`

Tagged at `packages/prismarine/src/world/portal/PortalIndex.ts:60`, `packages/prismarine/src/world/portal/rules.ts:31`.

```diff
  inlined net/minecraft/world/level/portal/PortalForcer.lambda#0(Lnet/minecraft/core/Holder;)Z
    aload_0
-   getstatic net/minecraft/world/entity/ai/village/poi/PoiTypes.NETHER_PORTAL Lnet/minecraft/resources/ResourceKey;
+   getstatic net/minecraft/world/entity/ai/village/poi/PoiTypeIds.NETHER_PORTAL Lnet/minecraft/resources/ResourceKey;
    invokeinterface net/minecraft/core/Holder.is (Lnet/minecraft/resources/ResourceKey;)Z
    ireturn
```

#### `PortalShape.getRelativePosition`

Tagged at `packages/prismarine/src/world/portal/search.ts:161`.

```diff
    dconst_0
    dconst_1
-   invokestatic net/minecraft/util/Mth.clamp (DDD)D
+   invokestatic java/lang/Math.clamp (DDD)D
    dstore 9
    goto L49
…
    dconst_0
    dconst_1
-   invokestatic net/minecraft/util/Mth.clamp (DDD)D
+   invokestatic java/lang/Math.clamp (DDD)D
    dstore 11
    goto L73
```

#### `Potions.SWIFTNESS`

Tagged at `packages/prismarine/src/entity/javaGoals.ts:30`.

```diff
    invokestatic net/minecraft/world/item/alchemy/Potions.register (Lnet/minecraft/resources/ResourceKey;Lnet/minecraft/world/item/alchemy/Potion;)Lnet/minecraft/core/Holder;
    putstatic net/minecraft/world/item/alchemy/Potions.INFESTED Lnet/minecraft/core/Holder;
+   getstatic net/minecraft/world/item/alchemy/PotionIds.FREEZING Lnet/minecraft/resources/ResourceKey;
+   new net/minecraft/world/item/alchemy/Potion
+   dup
+   ldc string "freezing"
+   iconst_1
+   anewarray net/minecraft/world/effect/MobEffectInstance
+   dup
+   iconst_0
+   new net/minecraft/world/effect/MobEffectInstance
+   dup
+   getstatic net/minecraft/world/effect/MobEffects.FREEZING Lnet/minecraft/core/Holder;
+   sipush 900
+   invokespecial net/minecraft/world/effect/MobEffectInstance.<init> (Lnet/minecraft/core/Holder;I)V
+   aastore
+   invokespecial net/minecraft/world/item/alchemy/Potion.<init> (Ljava/lang/String;[Lnet/minecraft/world/effect/MobEffectInstance;)V
+   invokestatic net/minecraft/world/item/alchemy/Potions.register (Lnet/minecraft/resources/ResourceKey;Lnet/minecraft/world/item/alchemy/Potion;)Lnet/minecraft/core/Holder;
+   putstatic net/minecraft/world/item/alchemy/Potions.FREEZING Lnet/minecraft/core/Holder;
+   getstatic net/minecraft/world/item/alchemy/PotionIds.LONG_FREEZING Lnet/minecraft/resources/ResourceKey;
+   new net/minecraft/world/item/alchemy/Potion
+   dup
+   ldc string "freezing"
+   iconst_1
+   anewarray net/minecraft/world/effect/MobEffectInstance
+   dup
+   iconst_0
+   new net/minecraft/world/effect/MobEffectInstance
+   dup
+   getstatic net/minecraft/world/effect/MobEffects.FREEZING Lnet/minecraft/core/Holder;
+   sipush 1800
+   invokespecial net/minecraft/world/effect/MobEffectInstance.<init> (Lnet/minecraft/core/Holder;I)V
+   aastore
+   invokespecial net/minecraft/world/item/alchemy/Potion.<init> (Ljava/lang/String;[Lnet/minecraft/world/effect/MobEffectInstance;)V
+   invokestatic net/minecraft/world/item/alchemy/Potions.register (Lnet/minecraft/resources/ResourceKey;Lnet/minecraft/world/item/alchemy/Potion;)Lnet/minecraft/core/Holder;
+   putstatic net/minecraft/world/item/alchemy/Potions.LONG_FREEZING Lnet/minecraft/core/Holder;
    return
  inlined net/minecraft/world/item/alchemy/Potions.register(Lnet/minecraft/resources/ResourceKey;Lnet/minecraft/world/item/alchemy/Potion;)Lnet/minecraft/core/Holder;
```

#### `ServerChunkCache.tickChunks()V`

Tagged at `packages/prismarine/src/world/World.ts:3673`, `packages/prismarine/src/world/WorldSystems.ts:626`.

```diff
  method net/minecraft/server/level/ServerChunkCache.tickChunks()V
-   aload_0
-   getfield net/minecraft/server/level/ServerChunkCache.level Lnet/minecraft/server/level/ServerLevel;
-   invokevirtual net/minecraft/server/level/ServerLevel.isDebug ()Z
-   ifeq L5
-   return
    invokestatic net/minecraft/util/profiling/Profiler.get ()Lnet/minecraft/util/profiling/ProfilerFiller;
    astore_1
…
    invokevirtual net/minecraft/server/level/ServerLevel.tickRateManager ()Lnet/minecraft/world/TickRateManager;
    invokevirtual net/minecraft/world/TickRateManager.runsNormally ()Z
-   ifeq L23
+   ifeq L18
    aload_1
    ldc string "tickingChunks"
```

#### `ServerPlayer.setExperiencePoints`

Tagged at `packages/prismarine/src/command/host/entities.ts:122`.

```diff
    fconst_0
    fload_3
-   invokestatic net/minecraft/util/Mth.clamp (FFF)F
+   invokestatic java/lang/Math.clamp (FFF)F
    fstore 4
    fload 4
```

#### `ShelfBlock.getStateForPlacement`

Tagged at `packages/block-behaviors/src/rules/javaPlacement.ts:376`.

```diff
  method net/minecraft/world/level/block/ShelfBlock.getStateForPlacement(Lnet/minecraft/world/item/context/BlockPlaceContext;)Lnet/minecraft/world/level/block/state/BlockState;
    aload_1
-   invokevirtual net/minecraft/world/item/context/BlockPlaceContext.getLevel ()Lnet/minecraft/world/level/Level;
-   aload_1
-   invokevirtual net/minecraft/world/item/context/BlockPlaceContext.getClickedPos ()Lnet/minecraft/core/BlockPos;
-   invokevirtual net/minecraft/world/level/Level.getFluidState (Lnet/minecraft/core/BlockPos;)Lnet/minecraft/world/level/material/FluidState;
+   invokevirtual net/minecraft/world/item/context/BlockPlaceContext.getClickedFluidState ()Lnet/minecraft/world/level/material/FluidState;
    astore_2
    aload_0
…
    aload_2
    getstatic net/minecraft/world/level/material/Fluids.WATER Lnet/minecraft/world/level/material/FlowingFluid;
-   invokevirtual net/minecraft/world/level/material/FluidState.is (Ljava/lang/Object;)Z
+   invokevirtual net/minecraft/world/level/material/FluidState.isSourceOfType (Lnet/minecraft/world/level/material/Fluid;)Z
    invokestatic java/lang/Boolean.valueOf (Z)Ljava/lang/Boolean;
    invokevirtual net/minecraft/world/level/block/state/BlockState.setValue (Lnet/minecraft/world/level/block/state/properties/Property;Ljava/lang/Comparable;)Ljava/lang/Object;
```

#### `ShulkerBullet.tick`

Tagged at `packages/prismarine/src/entity/data/projectileFlight.ts:33`.

```diff
    invokevirtual net/minecraft/world/entity/projectile/ShulkerBullet.level ()Lnet/minecraft/world/level/Level;
    invokevirtual net/minecraft/world/level/Level.isClientSide ()Z
-   ifne L99
+   ifne L97
    aload_1
    ifnonnull L25
…
    putfield net/minecraft/world/entity/projectile/ShulkerBullet.finalTarget Lnet/minecraft/world/entity/EntityReference;
    aload_1
-   ifnull L92
+   ifnull L90
    aload_1
    invokevirtual net/minecraft/world/entity/Entity.isAlive ()Z
-   ifeq L92
+   ifeq L90
    aload_1
    instanceof net/minecraft/world/entity/player/Player
…
    aload_1
    invokevirtual net/minecraft/world/entity/Entity.isSpectator ()Z
-   ifne L92
+   ifne L90
    aload_0
    aload_0
…
    ldc2_w double -1
    dconst_1
-   invokestatic net/minecraft/util/Mth.clamp (DDD)D
+   invokestatic java/lang/Math.clamp (DDD)D
    putfield net/minecraft/world/entity/projectile/ShulkerBullet.targetDeltaX D
    aload_0
…
    ldc2_w double -1
    dconst_1
-   invokestatic net/minecraft/util/Mth.clamp (DDD)D
+   invokestatic java/lang/Math.clamp (DDD)D
    putfield net/minecraft/world/entity/projectile/ShulkerBullet.targetDeltaY D
    aload_0
…
    ldc2_w double -1
    dconst_1
-   invokestatic net/minecraft/util/Mth.clamp (DDD)D
+   invokestatic java/lang/Math.clamp (DDD)D
    putfield net/minecraft/world/entity/projectile/ShulkerBullet.targetDeltaZ D
    aload_0
…
    astore_3
    aload_0
-   aload_3
    aload_0
    getfield net/minecraft/world/entity/projectile/ShulkerBullet.targetDeltaX D
…
    ldc2_w double 0.2
    dmul
-   invokevirtual net/minecraft/world/phys/Vec3.add (DDD)Lnet/minecraft/world/phys/Vec3;
-   invokevirtual net/minecraft/world/entity/projectile/ShulkerBullet.setDeltaMovement (Lnet/minecraft/world/phys/Vec3;)V
-   goto L94
+   invokevirtual net/minecraft/world/entity/projectile/ShulkerBullet.addDeltaMovement (DDD)V
+   goto L92
    aload_0
```

285 more lines. `java:sources --list 'ShulkerBullet.tick'` prints the listing under each `--java`.

#### `SkeletonTrapGoal.tick`

Tagged at `packages/entity-goals/src/goals/specials.ts:574`.

```diff
    aload_1
    invokevirtual net/minecraft/world/entity/monster/skeleton/Skeleton.getRandom ()Lnet/minecraft/util/RandomSource;
-   invokestatic net/minecraft/world/item/enchantment/EnchantmentHelper.enchantItemFromProvider (Lnet/minecraft/world/item/ItemStack;Lnet/minecraft/core/RegistryAccess;Lnet/minecraft/resources/ResourceKey;Lnet/minecraft/world/DifficultyInstance;Lnet/minecraft/util/RandomSource;)V
+   invokestatic net/minecraft/world/item/enchantment/EnchantmentHelper.enchantItemFromProvider (Lnet/minecraft/world/item/ItemStack;Lnet/minecraft/core/HolderGetter$Provider;Lnet/minecraft/resources/ResourceKey;Lnet/minecraft/world/DifficultyInstance;Lnet/minecraft/util/RandomSource;)V
    aload_1
    aload_2
```

#### `SpeleothemBlock.getStateForPlacement`

Tagged at `packages/block-behaviors/src/families/ground.ts:360`.

```diff
    invokeinterface net/minecraft/world/level/LevelAccessor.getFluidState (Lnet/minecraft/core/BlockPos;)Lnet/minecraft/world/level/material/FluidState;
    getstatic net/minecraft/world/level/material/Fluids.WATER Lnet/minecraft/world/level/material/FlowingFluid;
-   invokevirtual net/minecraft/world/level/material/FluidState.is (Ljava/lang/Object;)Z
+   invokevirtual net/minecraft/world/level/material/FluidState.isSourceOfType (Lnet/minecraft/world/level/material/Fluid;)Z
    invokestatic java/lang/Boolean.valueOf (Z)Ljava/lang/Boolean;
    invokevirtual net/minecraft/world/level/block/state/BlockState.setValue (Lnet/minecraft/world/level/block/state/properties/Property;Ljava/lang/Comparable;)Ljava/lang/Object;
```

#### `SpeleothemBlock.spawnFallingStalactite`

Tagged at `packages/block-behaviors/src/rules/dripstone.ts:131`.

```diff
    goto L5
    return
- inlined net/minecraft/world/level/block/SpeleothemBlock.isTip(Lnet/minecraft/world/level/block/state/BlockState;Z)Z
-   aload_0
-   getstatic net/minecraft/tags/BlockTags.SPELEOTHEMS Lnet/minecraft/tags/TagKey;
-   invokevirtual net/minecraft/world/level/block/state/BlockState.is (Lnet/minecraft/tags/TagKey;)Z
-   ifne L6
-   iconst_0
-   ireturn
-   aload_0
-   getstatic net/minecraft/world/level/block/SpeleothemBlock.THICKNESS Lnet/minecraft/world/level/block/state/properties/EnumProperty;
-   invokevirtual net/minecraft/world/level/block/state/BlockState.getValue (Lnet/minecraft/world/level/block/state/properties/Property;)Ljava/lang/Comparable;
-   checkcast net/minecraft/world/level/block/state/properties/SpeleothemThickness
-   astore_2
-   aload_2
-   getstatic net/minecraft/world/level/block/state/properties/SpeleothemThickness.TIP Lnet/minecraft/world/level/block/state/properties/SpeleothemThickness;
-   if_acmpeq L19
-   iload_1
-   ifeq L21
-   aload_2
-   getstatic net/minecraft/world/level/block/state/properties/SpeleothemThickness.TIP_MERGE Lnet/minecraft/world/level/block/state/properties/SpeleothemThickness;
-   if_acmpne L21
-   iconst_1
-   goto L22
-   iconst_0
-   ireturn
```

#### `StandingSignBlock.getStateForPlacement`

Tagged at `packages/block-behaviors/src/rules/javaPlacement.ts:302`.

```diff
  method net/minecraft/world/level/block/StandingSignBlock.getStateForPlacement(Lnet/minecraft/world/item/context/BlockPlaceContext;)Lnet/minecraft/world/level/block/state/BlockState;
    aload_1
-   invokevirtual net/minecraft/world/item/context/BlockPlaceContext.getLevel ()Lnet/minecraft/world/level/Level;
-   aload_1
-   invokevirtual net/minecraft/world/item/context/BlockPlaceContext.getClickedPos ()Lnet/minecraft/core/BlockPos;
-   invokevirtual net/minecraft/world/level/Level.getFluidState (Lnet/minecraft/core/BlockPos;)Lnet/minecraft/world/level/material/FluidState;
+   invokevirtual net/minecraft/world/item/context/BlockPlaceContext.getClickedFluidState ()Lnet/minecraft/world/level/material/FluidState;
    astore_2
    aload_0
…
    aload_2
    getstatic net/minecraft/world/level/material/Fluids.WATER Lnet/minecraft/world/level/material/FlowingFluid;
-   invokevirtual net/minecraft/world/level/material/FluidState.is (Ljava/lang/Object;)Z
+   invokevirtual net/minecraft/world/level/material/FluidState.isSourceOfType (Lnet/minecraft/world/level/material/Fluid;)Z
    invokestatic java/lang/Boolean.valueOf (Z)Ljava/lang/Boolean;
    invokevirtual net/minecraft/world/level/block/state/BlockState.setValue (Lnet/minecraft/world/level/block/state/properties/Property;Ljava/lang/Comparable;)Ljava/lang/Object;
```

#### `StructureManager.getStructureAt(Lnet/minecraft/core/BlockPos;Lnet/minecraft/world/level/levelgen/structure/Structure;)Lnet/minecraft/world/level/levelgen/structure/StructureStart;`

Tagged at `packages/prismarine/src/world/Generator.ts:274`.

```diff
    areturn
    goto L15
-   getstatic net/minecraft/world/level/levelgen/structure/StructureStart.INVALID_START Lnet/minecraft/world/level/levelgen/structure/StructureStart;
+   aconst_null
    areturn
```

#### `SulfurCube.knockback`

Tagged at `packages/prismarine/src/entity/data/EntityRuntime.ts:4300`, `packages/prismarine/src/entity/data/sulfurCubeKnockback.ts:117`.

```diff
    fload 14
    fstore 16
-   aload_0
-   getfield net/minecraft/world/entity/monster/cubemob/SulfurCube.soundSettings Lnet/minecraft/world/entity/SulfurCubeArchetype$SoundSettings;
-   invokevirtual net/minecraft/world/entity/SulfurCubeArchetype$SoundSettings.hitSound ()Lnet/minecraft/core/Holder;
-   astore 17
    new net/minecraft/world/phys/Vec2
    dup
…
    d2f
    invokespecial net/minecraft/world/phys/Vec2.<init> (FF)V
-   astore 18
+   astore 17
    aload_0
    ldc float 1.600000023841858
-   aload 18
+   aload 17
    aload 7
    invokevirtual net/minecraft/world/damagesource/DamageSource.getEntity ()Lnet/minecraft/world/entity/Entity;
…
    invokevirtual net/minecraft/world/phys/AABB.getCenter ()Lnet/minecraft/world/phys/Vec3;
    invokevirtual net/minecraft/world/entity/monster/cubemob/SulfurCube.applyHorizontalHitAngleScale (FLnet/minecraft/world/phys/Vec2;Lnet/minecraft/world/phys/Vec3;Lnet/minecraft/world/phys/Vec3;Lnet/minecraft/world/phys/Vec3;)Lnet/minecraft/world/phys/Vec2;
-   astore 19
+   astore 18
    aload_0
    ldc float 0.5
…
    invokevirtual net/minecraft/world/entity/monster/cubemob/SulfurCube.getBbHeight ()F
    invokevirtual net/minecraft/world/entity/monster/cubemob/SulfurCube.applyVerticalHitAnglePowerTransfer (FFFLnet/minecraft/world/phys/Vec3;Lnet/minecraft/world/phys/Vec3;Lnet/minecraft/world/phys/Vec3;F)Lnet/minecraft/world/phys/Vec2;
-   astore 20
-   aload 20
+   astore 19
+   aload 19
    getfield net/minecraft/world/phys/Vec2.x F
    fstore 13
-   aload 20
+   aload 19
    getfield net/minecraft/world/phys/Vec2.y F
    fstore 14
…
    invokevirtual net/minecraft/world/entity/monster/cubemob/SulfurCube.position ()Lnet/minecraft/world/phys/Vec3;
    invokevirtual net/minecraft/world/entity/monster/cubemob/SulfurCube.applyVerticalPositionAnglePowerRotation (FFFFFLnet/minecraft/world/phys/Vec3;Lnet/minecraft/world/phys/Vec3;)Lnet/minecraft/world/phys/Vec2;
-   astore 20
-   aload 20
+   astore 19
+   aload 19
    getfield net/minecraft/world/phys/Vec2.x F
    fstore 13
-   aload 20
+   aload 19
    getfield net/minecraft/world/phys/Vec2.y F
    fstore 14
-   aload 19
+   aload 18
    getfield net/minecraft/world/phys/Vec2.x F
    f2d
    dstore_3
-   aload 19
+   aload 18
    getfield net/minecraft/world/phys/Vec2.y F
```

106 more lines. `java:sources --list 'SulfurCube.knockback'` prints the listing under each `--java`.

#### `ThrowableProjectile.tick`

Tagged at `packages/prismarine/src/entity/data/projectileFlight.ts:27`.

```diff
    aload_0
    invokevirtual net/minecraft/world/entity/projectile/ThrowableProjectile.isInWater ()Z
-   ifeq L52
-   iconst_0
-   istore 4
-   iload 4
-   iconst_4
-   if_icmpge L49
-   ldc float 0.25
-   fstore 5
+   ifeq L15
    aload_0
-   invokevirtual net/minecraft/world/entity/projectile/ThrowableProjectile.level ()Lnet/minecraft/world/level/Level;
-   getstatic net/minecraft/core/particles/ParticleTypes.BUBBLE Lnet/minecraft/core/particles/SimpleParticleType;
    aload_2
-   getfield net/minecraft/world/phys/Vec3.x D
-   aload_1
-   getfield net/minecraft/world/phys/Vec3.x D
-   ldc2_w double 0.25
-   dmul
-   dsub
-   aload_2
-   getfield net/minecraft/world/phys/Vec3.y D
-   aload_1
-   getfield net/minecraft/world/phys/Vec3.y D
-   ldc2_w double 0.25
-   dmul
-   dsub
-   aload_2
-   getfield net/minecraft/world/phys/Vec3.z D
-   aload_1
-   getfield net/minecraft/world/phys/Vec3.z D
-   ldc2_w double 0.25
-   dmul
-   dsub
-   aload_1
-   getfield net/minecraft/world/phys/Vec3.x D
-   aload_1
-   getfield net/minecraft/world/phys/Vec3.y D
-   aload_1
-   getfield net/minecraft/world/phys/Vec3.z D
-   invokevirtual net/minecraft/world/level/Level.addParticle (Lnet/minecraft/core/particles/ParticleOptions;DDDDDD)V
-   iinc 4 1
-   goto L11
+   invokevirtual net/minecraft/world/entity/projectile/ThrowableProjectile.addBubbleParticles (Lnet/minecraft/world/phys/Vec3;)V
    ldc float 0.800000011920929
    fstore_3
-   goto L55
+   goto L18
    aload_0
    invokevirtual net/minecraft/world/entity/projectile/ThrowableProjectile.getAirDrag ()F
```

#### `TrapDoorBlock.getStateForPlacement`

Tagged at `packages/block-behaviors/src/families/openable.ts:148`.

```diff
    astore_2
    aload_1
-   invokevirtual net/minecraft/world/item/context/BlockPlaceContext.getLevel ()Lnet/minecraft/world/level/Level;
-   aload_1
-   invokevirtual net/minecraft/world/item/context/BlockPlaceContext.getClickedPos ()Lnet/minecraft/core/BlockPos;
-   invokevirtual net/minecraft/world/level/Level.getFluidState (Lnet/minecraft/core/BlockPos;)Lnet/minecraft/world/level/material/FluidState;
+   invokevirtual net/minecraft/world/item/context/BlockPlaceContext.getClickedFluidState ()Lnet/minecraft/world/level/material/FluidState;
    astore_3
    aload_1
…
    aload_1
    invokevirtual net/minecraft/world/item/context/BlockPlaceContext.replacingClickedOnBlock ()Z
-   ifne L19
+   ifne L16
    aload 4
    invokevirtual net/minecraft/core/Direction.getAxis ()Lnet/minecraft/core/Direction$Axis;
    invokevirtual net/minecraft/core/Direction$Axis.isHorizontal ()Z
-   ifne L37
+   ifne L34
    aload_2
    getstatic net/minecraft/world/level/block/TrapDoorBlock.FACING Lnet/minecraft/world/level/block/state/properties/EnumProperty;
…
    aload 4
    getstatic net/minecraft/core/Direction.UP Lnet/minecraft/core/Direction;
-   if_acmpne L32
+   if_acmpne L29
    getstatic net/minecraft/world/level/block/state/properties/Half.BOTTOM Lnet/minecraft/world/level/block/state/properties/Half;
-   goto L33
+   goto L30
    getstatic net/minecraft/world/level/block/state/properties/Half.TOP Lnet/minecraft/world/level/block/state/properties/Half;
    invokevirtual net/minecraft/world/level/block/state/BlockState.setValue (Lnet/minecraft/world/level/block/state/properties/Property;Ljava/lang/Comparable;)Ljava/lang/Object;
    checkcast net/minecraft/world/level/block/state/BlockState
    astore_2
-   goto L60
+   goto L57
    aload_2
    getstatic net/minecraft/world/level/block/TrapDoorBlock.FACING Lnet/minecraft/world/level/block/state/properties/EnumProperty;
…
    ldc2_w double 0.5
    dcmpl
-   ifle L56
+   ifle L53
    getstatic net/minecraft/world/level/block/state/properties/Half.TOP Lnet/minecraft/world/level/block/state/properties/Half;
-   goto L57
+   goto L54
    getstatic net/minecraft/world/level/block/state/properties/Half.BOTTOM Lnet/minecraft/world/level/block/state/properties/Half;
    invokevirtual net/minecraft/world/level/block/state/BlockState.setValue (Lnet/minecraft/world/level/block/state/properties/Property;Ljava/lang/Comparable;)Ljava/lang/Object;
…
    invokevirtual net/minecraft/world/item/context/BlockPlaceContext.getClickedPos ()Lnet/minecraft/core/BlockPos;
    invokevirtual net/minecraft/world/level/Level.hasNeighborSignal (Lnet/minecraft/core/BlockPos;)Z
-   ifeq L78
+   ifeq L75
    aload_2
    getstatic net/minecraft/world/level/block/TrapDoorBlock.OPEN Lnet/minecraft/world/level/block/state/properties/BooleanProperty;
…
    aload_3
    getstatic net/minecraft/world/level/material/Fluids.WATER Lnet/minecraft/world/level/material/FlowingFluid;
-   invokevirtual net/minecraft/world/level/material/FluidState.is (Ljava/lang/Object;)Z
+   invokevirtual net/minecraft/world/level/material/FluidState.isSourceOfType (Lnet/minecraft/world/level/material/Fluid;)Z
    invokestatic java/lang/Boolean.valueOf (Z)Ljava/lang/Boolean;
```

1 more lines. `java:sources --list 'TrapDoorBlock.getStateForPlacement'` prints the listing under each `--java`.

#### `WallHangingSignBlock.getStateForPlacement`

Tagged at `packages/block-behaviors/src/rules/javaPlacement.ts:332`.

```diff
    astore_2
    aload_1
-   invokevirtual net/minecraft/world/item/context/BlockPlaceContext.getLevel ()Lnet/minecraft/world/level/Level;
-   aload_1
-   invokevirtual net/minecraft/world/item/context/BlockPlaceContext.getClickedPos ()Lnet/minecraft/core/BlockPos;
-   invokevirtual net/minecraft/world/level/Level.getFluidState (Lnet/minecraft/core/BlockPos;)Lnet/minecraft/world/level/material/FluidState;
+   invokevirtual net/minecraft/world/item/context/BlockPlaceContext.getClickedFluidState ()Lnet/minecraft/world/level/material/FluidState;
    astore_3
    aload_1
…
    iload 8
    iload 7
-   if_icmpge L72
+   if_icmpge L69
    aload 6
    iload 8
…
    invokevirtual net/minecraft/core/Direction.getAxis ()Lnet/minecraft/core/Direction$Axis;
    invokevirtual net/minecraft/core/Direction$Axis.isHorizontal ()Z
-   ifeq L70
+   ifeq L67
    aload 9
    invokevirtual net/minecraft/core/Direction.getAxis ()Lnet/minecraft/core/Direction$Axis;
…
    invokevirtual net/minecraft/world/item/context/BlockPlaceContext.getClickedFace ()Lnet/minecraft/core/Direction;
    invokevirtual net/minecraft/core/Direction$Axis.test (Lnet/minecraft/core/Direction;)Z
-   ifeq L41
-   goto L70
+   ifeq L38
+   goto L67
    aload 9
    invokevirtual net/minecraft/core/Direction.getOpposite ()Lnet/minecraft/core/Direction;
…
    aload 5
    invokevirtual net/minecraft/world/level/block/state/BlockState.canSurvive (Lnet/minecraft/world/level/LevelReader;Lnet/minecraft/core/BlockPos;)Z
-   ifeq L70
+   ifeq L67
    aload_0
    aload_2
…
    aload 5
    invokevirtual net/minecraft/world/level/block/WallHangingSignBlock.canPlace (Lnet/minecraft/world/level/block/state/BlockState;Lnet/minecraft/world/level/LevelReader;Lnet/minecraft/core/BlockPos;)Z
-   ifeq L70
+   ifeq L67
    aload_2
    getstatic net/minecraft/world/level/block/WallHangingSignBlock.WATERLOGGED Lnet/minecraft/world/level/block/state/properties/BooleanProperty;
    aload_3
    getstatic net/minecraft/world/level/material/Fluids.WATER Lnet/minecraft/world/level/material/FlowingFluid;
-   invokevirtual net/minecraft/world/level/material/FluidState.is (Ljava/lang/Object;)Z
+   invokevirtual net/minecraft/world/level/material/FluidState.isSourceOfType (Lnet/minecraft/world/level/material/Fluid;)Z
    invokestatic java/lang/Boolean.valueOf (Z)Ljava/lang/Boolean;
    invokevirtual net/minecraft/world/level/block/state/BlockState.setValue (Lnet/minecraft/world/level/block/state/properties/Property;Ljava/lang/Comparable;)Ljava/lang/Object;
…
    areturn
    iinc 8 1
-   goto L23
+   goto L20
    aconst_null
    areturn
```

#### `WallSignBlock.getStateForPlacement`

Tagged at `packages/block-behaviors/src/rules/javaPlacement.ts:386`.

```diff
    astore_2
    aload_1
-   invokevirtual net/minecraft/world/item/context/BlockPlaceContext.getLevel ()Lnet/minecraft/world/level/Level;
-   aload_1
-   invokevirtual net/minecraft/world/item/context/BlockPlaceContext.getClickedPos ()Lnet/minecraft/core/BlockPos;
-   invokevirtual net/minecraft/world/level/Level.getFluidState (Lnet/minecraft/core/BlockPos;)Lnet/minecraft/world/level/material/FluidState;
+   invokevirtual net/minecraft/world/item/context/BlockPlaceContext.getClickedFluidState ()Lnet/minecraft/world/level/material/FluidState;
    astore_3
    aload_1
…
    iload 9
    iload 8
-   if_icmpge L62
+   if_icmpge L59
    aload 7
    iload 9
…
    invokevirtual net/minecraft/core/Direction.getAxis ()Lnet/minecraft/core/Direction$Axis;
    invokevirtual net/minecraft/core/Direction$Axis.isHorizontal ()Z
-   ifne L37
-   goto L60
+   ifne L34
+   goto L57
    aload 10
    invokevirtual net/minecraft/core/Direction.getOpposite ()Lnet/minecraft/core/Direction;
…
    aload 5
    invokevirtual net/minecraft/world/level/block/state/BlockState.canSurvive (Lnet/minecraft/world/level/LevelReader;Lnet/minecraft/core/BlockPos;)Z
-   ifeq L60
+   ifeq L57
    aload_2
    getstatic net/minecraft/world/level/block/WallSignBlock.WATERLOGGED Lnet/minecraft/world/level/block/state/properties/BooleanProperty;
    aload_3
    getstatic net/minecraft/world/level/material/Fluids.WATER Lnet/minecraft/world/level/material/FlowingFluid;
-   invokevirtual net/minecraft/world/level/material/FluidState.is (Ljava/lang/Object;)Z
+   invokevirtual net/minecraft/world/level/material/FluidState.isSourceOfType (Lnet/minecraft/world/level/material/Fluid;)Z
    invokestatic java/lang/Boolean.valueOf (Z)Ljava/lang/Boolean;
    invokevirtual net/minecraft/world/level/block/state/BlockState.setValue (Lnet/minecraft/world/level/block/state/properties/Property;Ljava/lang/Comparable;)Ljava/lang/Object;
…
    areturn
    iinc 9 1
-   goto L25
+   goto L22
    aconst_null
    areturn
```

#### `Warden$VibrationUser.onReceiveVibration`

Tagged at `packages/prismarine/src/entity/data/EntityRuntime.ts:3246`.

```diff
    aload_2
    astore 7
+   aload 4
+   astore 8
    aload 5
-   ifnull L68
+   ifnull L70
    aload_0
    getfield net/minecraft/world/entity/monster/warden/Warden$VibrationUser.this$0 Lnet/minecraft/world/entity/monster/warden/Warden;
…
    ldc2_w double 30
    invokevirtual net/minecraft/world/entity/monster/warden/Warden.closerThan (Lnet/minecraft/world/entity/Entity;D)Z
-   ifeq L60
+   ifeq L62
    aload_0
    getfield net/minecraft/world/entity/monster/warden/Warden$VibrationUser.this$0 Lnet/minecraft/world/entity/monster/warden/Warden;
…
    getstatic net/minecraft/world/entity/ai/memory/MemoryModuleType.RECENT_PROJECTILE Lnet/minecraft/world/entity/ai/memory/MemoryModuleType;
    invokevirtual net/minecraft/world/entity/ai/Brain.hasMemoryValue (Lnet/minecraft/world/entity/ai/memory/MemoryModuleType;)Z
-   ifeq L54
+   ifeq L56
    aload_0
    getfield net/minecraft/world/entity/monster/warden/Warden$VibrationUser.this$0 Lnet/minecraft/world/entity/monster/warden/Warden;
    aload 5
    invokevirtual net/minecraft/world/entity/monster/warden/Warden.canTargetEntity (Lnet/minecraft/world/entity/Entity;)Z
-   ifeq L49
+   ifeq L51
    aload 5
    invokevirtual net/minecraft/world/entity/Entity.blockPosition ()Lnet/minecraft/core/BlockPos;
…
    aload 5
    invokevirtual net/minecraft/world/entity/monster/warden/Warden.increaseAngerAt (Lnet/minecraft/world/entity/Entity;)V
-   goto L60
+   goto L62
    aload_0
    getfield net/minecraft/world/entity/monster/warden/Warden$VibrationUser.this$0 Lnet/minecraft/world/entity/monster/warden/Warden;
…
    ldc2_w long 100
    invokevirtual net/minecraft/world/entity/ai/Brain.setMemoryWithExpiry (Lnet/minecraft/world/entity/ai/memory/MemoryModuleType;Ljava/lang/Object;J)V
-   goto L72
+   goto L81
+   aload 4
+   invokestatic net/minecraft/world/level/block/entity/SculkShriekerBlockEntity.getLastDamagingEntity (Lnet/minecraft/world/entity/Entity;)Lnet/minecraft/world/entity/Entity;
+   astore 9
+   aload 9
+   ifnull L77
+   aload 9
+   astore 8
    aload_0
    getfield net/minecraft/world/entity/monster/warden/Warden$VibrationUser.this$0 Lnet/minecraft/world/entity/monster/warden/Warden;
-   aload 4
+   aload 8
    invokevirtual net/minecraft/world/entity/monster/warden/Warden.increaseAngerAt (Lnet/minecraft/world/entity/Entity;)V
    aload_0
…
    invokevirtual net/minecraft/world/entity/monster/warden/Warden.getAngerLevel ()Lnet/minecraft/world/entity/monster/warden/AngerLevel;
    invokevirtual net/minecraft/world/entity/monster/warden/AngerLevel.isAngry ()Z
-   ifne L95
+   ifne L104
    aload_0
```

22 more lines. `java:sources --list 'Warden$VibrationUser.onReceiveVibration'` prints the listing under each `--java`.

#### `WorldBorder.clampVec3ToBound(DDD)Lnet/minecraft/world/phys/Vec3;`

Tagged at `packages/block-behaviors/src/rules/portal.ts:537`.

```diff
    ldc2_w double 0.000009999999747378752
    dsub
-   invokestatic net/minecraft/util/Mth.clamp (DDD)D
+   invokestatic java/lang/Math.clamp (DDD)D
    dload_3
    dload 5
…
    ldc2_w double 0.000009999999747378752
    dsub
-   invokestatic net/minecraft/util/Mth.clamp (DDD)D
+   invokestatic java/lang/Math.clamp (DDD)D
    invokespecial net/minecraft/world/phys/Vec3.<init> (DDD)V
    areturn
```

#### `Zombie.DOOR_BREAKING_PREDICATE`

Tagged at `packages/entity-goals/src/goals/movement.ts:2274`.

```diff
    invokestatic net/minecraft/network/syncher/SynchedEntityData.defineId (Ljava/lang/Class;Lnet/minecraft/network/syncher/EntityDataSerializer;)Lnet/minecraft/network/syncher/EntityDataAccessor;
    putstatic net/minecraft/world/entity/monster/zombie/Zombie.DATA_DROWNED_CONVERSION_ID Lnet/minecraft/network/syncher/EntityDataAccessor;
+   ldc class net/minecraft/world/entity/monster/zombie/Zombie
+   getstatic net/minecraft/network/syncher/EntityDataSerializers.BOOLEAN Lnet/minecraft/network/syncher/EntityDataSerializer;
+   invokestatic net/minecraft/network/syncher/SynchedEntityData.defineId (Ljava/lang/Class;Lnet/minecraft/network/syncher/EntityDataSerializer;)Lnet/minecraft/network/syncher/EntityDataAccessor;
+   putstatic net/minecraft/world/entity/monster/zombie/Zombie.DATA_FROSTBITE_CONVERSION_ID Lnet/minecraft/network/syncher/EntityDataAccessor;
    ldc float 0.49000000953674316
    ldc float 0.9800000190734863
```

### Removed or renamed

- `AmethystClusterBlock.getStateForPlacement`, tagged at `packages/block-behaviors/src/rules/javaPlacement.ts:370`: net/minecraft/world/level/block/AmethystClusterBlock declares no getStateForPlacement. The closest 26.4-pre-1 member is `net/minecraft/world/level/block/AbstractCrystalClusterBlock.getStateForPlacement(Lnet/minecraft/world/item/context/BlockPlaceContext;)Lnet/minecraft/world/level/block/state/BlockState;`, which a superclass declares now.
- `BiomeManager.getBiome(Lnet/minecraft/core/BlockPos;)Lnet/minecraft/core/Holder;`, tagged at `packages/prismarine/src/world/generators/datadriven/DataDrivenGenerator.ts:2041`: net/minecraft/world/level/biome/BiomeManager declares no getBiome.
- `BlocksAttacks.resolveBlockedDamage`, tagged at `packages/prismarine/src/entity/data/itemBlocking.ts:65`: resolves to net/minecraft/world/item/component/BlocksAttacks.resolveBlockedDamage(Lnet/minecraft/world/damagesource/DamageSource;FD)Ljava/util/Optional;, not net/minecraft/world/item/component/BlocksAttacks.resolveBlockedDamage(Lnet/minecraft/world/damagesource/DamageSource;FD)F. The closest 26.4-pre-1 member is `net/minecraft/world/item/component/BlocksAttacks.resolveBlockedDamage(Lnet/minecraft/world/damagesource/DamageSource;FD)Ljava/util/Optional;`.
- `Entity.checkFallDamage`, tagged at `packages/prismarine/src/entity/data/EntityRuntime.ts:7279`: resolves to net/minecraft/world/entity/Entity.checkFallDamage(ZLnet/minecraft/world/level/block/state/BlockState;Lnet/minecraft/core/BlockPos;)V, not net/minecraft/world/entity/Entity.checkFallDamage(DZLnet/minecraft/world/level/block/state/BlockState;Lnet/minecraft/core/BlockPos;)V. The closest 26.4-pre-1 member is `net/minecraft/world/entity/Entity.checkFallDamage(ZLnet/minecraft/world/level/block/state/BlockState;Lnet/minecraft/core/BlockPos;)V`.
- `ItemCommands.applyModifier`, tagged at `packages/prismarine/src/command/host/inventory.ts:291`: resolves to net/minecraft/server/commands/item/ItemCommands.applyModifier(Lnet/minecraft/commands/CommandSourceStack;Lnet/minecraft/commands/arguments/ValidationWrapper;)Ljava/util/function/UnaryOperator;, not net/minecraft/server/commands/item/ItemCommands.applyModifier(Lnet/minecraft/commands/CommandSourceStack;Lnet/minecraft/world/level/storage/loot/functions/LootItemFunction;)Ljava/util/function/UnaryOperator;. The closest 26.4-pre-1 member is `net/minecraft/server/commands/item/ItemCommands.applyModifier(Lnet/minecraft/commands/CommandSourceStack;Lnet/minecraft/commands/arguments/ValidationWrapper;)Ljava/util/function/UnaryOperator;`.
- `LivingEntity.applyItemBlocking`, tagged at `packages/prismarine/src/entity/data/EntityRuntime.ts:4399`: resolves to net/minecraft/world/entity/LivingEntity.applyItemBlocking(Lnet/minecraft/server/level/ServerLevel;Lnet/minecraft/world/damagesource/DamageSource;F)Ljava/util/Optional;, not net/minecraft/world/entity/LivingEntity.applyItemBlocking(Lnet/minecraft/server/level/ServerLevel;Lnet/minecraft/world/damagesource/DamageSource;F)F. The closest 26.4-pre-1 member is `net/minecraft/world/entity/LivingEntity.applyItemBlocking(Lnet/minecraft/server/level/ServerLevel;Lnet/minecraft/world/damagesource/DamageSource;F)Ljava/util/Optional;`.
- `LivingEntity.jumpInLiquid`, tagged at `packages/prismarine/src/entity/data/DataEntity.ts:133`: resolves to net/minecraft/world/entity/LivingEntity.jumpInLiquid(Ljava/util/List;)V, not net/minecraft/world/entity/LivingEntity.jumpInLiquid(Lnet/minecraft/tags/TagKey;)V. The closest 26.4-pre-1 member is `net/minecraft/world/entity/LivingEntity.jumpInLiquid(Ljava/util/List;)V`.
- `net/minecraft/server/commands/ExecuteCommand.countItems`, tagged at `packages/prismarine/src/command/host/slotSource.ts:159`: resolves to net/minecraft/server/commands/ExecuteCommand.countItems(Lnet/minecraft/commands/CommandSourceStack;Lnet/minecraft/server/commands/item/ItemAccessor;Lnet/minecraft/commands/arguments/SlotSourceArgument$SlotResult;Ljava/util/function/Predicate;)I, not net/minecraft/server/commands/ExecuteCommand.countItems(Lnet/minecraft/commands/CommandSourceStack;Lnet/minecraft/server/commands/item/ItemAccessor;Lnet/minecraft/commands/arguments/SlotSourceArgument$Result;Ljava/util/function/Predicate;)I. The closest 26.4-pre-1 member is `net/minecraft/server/commands/ExecuteCommand.countItems(Lnet/minecraft/commands/CommandSourceStack;Lnet/minecraft/server/commands/item/ItemAccessor;Lnet/minecraft/commands/arguments/SlotSourceArgument$SlotResult;Ljava/util/function/Predicate;)I`.

### Changed callees

Advisory. Methods of other classes that tagged members call, that no tag names, and whose
bytecode changed in 26.4-pre-1. Read each one and tag it, or note why it does not matter to the copy.

- `net/minecraft/commands/arguments/SlotSourceArgument$Result.value()Lnet/minecraft/world/item/slot/SlotSource;`, called by `net/minecraft/server/commands/ExecuteCommand.countItems`
- `net/minecraft/commands/Commands.performPrefixedCommand(Lnet/minecraft/commands/CommandSourceStack;Ljava/lang/String;)V`, called by `BaseCommandBlock.performCommand`
- `net/minecraft/core/BlockPos$6.<init>(Lnet/minecraft/core/Direction;Lnet/minecraft/core/Direction;Lnet/minecraft/core/BlockPos;I)V`, called by `BlockPos.spiralAround`
- `net/minecraft/core/Registry.getTagOrEmpty(Lnet/minecraft/tags/TagKey;)Ljava/lang/Iterable;`, called by `Painting.create`
- `net/minecraft/core/Registry.register(Lnet/minecraft/core/Registry;Ljava/lang/String;Ljava/lang/Object;)Ljava/lang/Object;`, called by `Stats.TIME_SINCE_REST`
- `net/minecraft/core/Registry.register(Lnet/minecraft/core/Registry;Lnet/minecraft/resources/ResourceKey;Ljava/lang/Object;)Ljava/lang/Object;`, called by `Blocks.SNOW`
- `net/minecraft/CrashReportCategory.populateBlockDetails(Lnet/minecraft/CrashReportCategory;Lnet/minecraft/world/level/LevelHeightAccessor;Lnet/minecraft/core/BlockPos;Lnet/minecraft/world/level/block/state/BlockState;)V`, called by `Entity.checkInsideBlocks(Lnet/minecraft/world/phys/Vec3;Lnet/minecraft/world/phys/Vec3;Lnet/minecraft/world/entity/InsideBlockEffectApplier$StepBasedCollector;Lit/unimi/dsi/fastutil/longs/LongSet;I)I`
- `net/minecraft/network/chat/Component.getString()Ljava/lang/String;`, called by `BaseCommandBlock.performCommand`
- `net/minecraft/network/codec/ByteBufCodecs.idMapper(Ljava/util/function/IntFunction;Ljava/util/function/ToIntFunction;)Lnet/minecraft/network/codec/StreamCodec;`, called by `DyeColor.BLACK`, `EquipmentSlot.SADDLE`
- `net/minecraft/server/commands/item/ItemAccessor.getSlots(Lnet/minecraft/commands/CommandSourceStack;Lnet/minecraft/world/item/slot/SlotSource;)Lnet/minecraft/world/item/slot/SlotCollection;`, called by `net/minecraft/server/commands/ExecuteCommand.countItems`
- `net/minecraft/server/level/ServerPlayer.<init>(Lnet/minecraft/server/MinecraftServer;Lnet/minecraft/server/level/ServerLevel;Lcom/mojang/authlib/GameProfile;Lnet/minecraft/server/level/ClientInformation;)V`, called by `PlayerList.respawn`
- `net/minecraft/server/level/ServerPlayer.createCommonSpawnInfo(Lnet/minecraft/server/level/ServerLevel;)Lnet/minecraft/network/protocol/game/CommonPlayerSpawnInfo;`, called by `PlayerList.respawn`
- `net/minecraft/server/level/ServerPlayer.sendPostEffects()V`, called by `PlayerList.respawn`
- `net/minecraft/tags/TagKey.create(Lnet/minecraft/resources/ResourceKey;Lnet/minecraft/resources/Identifier;)Lnet/minecraft/tags/TagKey;`, called by `BiomeTags.WATER_ON_MAP_OUTLINES`, `BlockTags.DOORS`, `PaintingVariantTags.PLACEABLE`
- `net/minecraft/util/BlockUtil.clampedPackDifferenceInPosition(Lnet/minecraft/core/BlockPos;Lnet/minecraft/core/BlockPos;III)I`, called by `Enderman.teleport(DDD)Z`
- `net/minecraft/util/ByIdMap.continuous(Ljava/util/function/ToIntFunction;[Ljava/lang/Object;Lnet/minecraft/util/ByIdMap$OutOfBoundsStrategy;)Ljava/util/function/IntFunction;`, called by `DyeColor.BLACK`, `EquipmentSlot.SADDLE`
- `net/minecraft/util/Mth.clamp(DDD)D`, called by `DragonSittingScanningPhase.doServerTick`, `EnderDragon.aiStep`, `LivingEntity.handleOnClimbable`, `LivingEntity.travel`, `PortalShape.getRelativePosition`, `ShulkerBullet.tick`, `WorldBorder.clampVec3ToBound(DDD)Lnet/minecraft/world/phys/Vec3;`
- `net/minecraft/util/Mth.clamp(FFF)F`, called by `BlocksAttacks.resolveBlockedDamage`, `CombatRules.getDamageAfterMagicAbsorb`, `EnderDragon.aiStep`, `LivingEntity.computeModifiedFriction`, `LivingEntity.travel`, `ServerPlayer.setExperiencePoints`, `SulfurCube.knockback`
- `net/minecraft/util/Mth.clamp(III)I`, called by `PortalForcer.createPortal`
- `net/minecraft/util/Mth.rotateIfNecessary(FFF)F`, called by `BackUpIfTooClose.create`
- `net/minecraft/util/ProblemReporter$ScopedCollector.close()V`, called by `FallingBlockEntity.tick`
- `net/minecraft/util/Util.pauseInIde(Ljava/lang/Throwable;)Ljava/lang/Throwable;`, called by `Entity.move`
- `net/minecraft/world/damagesource/DamageSources.explosion(Lnet/minecraft/world/entity/Entity;Lnet/minecraft/world/entity/Entity;)Lnet/minecraft/world/damagesource/DamageSource;`, called by `EndCrystal.hurtServer`, `EnderDragon.onCrystalDestroyed`
- `net/minecraft/world/damagesource/DamageSources.fireball(Lnet/minecraft/world/entity/projectile/hurtingprojectile/Fireball;Lnet/minecraft/world/entity/Entity;)Lnet/minecraft/world/damagesource/DamageSource;`, called by `SmallFireball.onHitEntity`
- `net/minecraft/world/damagesource/DamageSources.indirectMagic(Lnet/minecraft/world/entity/Entity;Lnet/minecraft/world/entity/Entity;)Lnet/minecraft/world/damagesource/DamageSource;`, called by `AbstractThrownPotion.onHit`, `HealOrHarmMobEffect.applyInstantaneousEffect`
- `net/minecraft/world/damagesource/DamageSources.mobAttack(Lnet/minecraft/world/entity/LivingEntity;)Lnet/minecraft/world/damagesource/DamageSource;`, called by `EnderDragon.aiStep`, `IronGolem.doHurtTarget`, `Ravager.roar`
- `net/minecraft/world/entity/ai/behavior/ShufflingList.<init>()V`, called by `TriggerGate.triggerGate`
- `net/minecraft/world/entity/ai/control/LookControl.setLookAt(Lnet/minecraft/world/entity/Entity;FF)V`, called by `Fox$FoxPounceGoal.tick`
- `net/minecraft/world/entity/animal/equine/AbstractHorse.aiStep()V`, called by `SkeletonHorse.aiStep`
- `net/minecraft/world/entity/animal/feline/Cat.hiss()V`, called by `Phantom$PhantomSweepAttackGoal.canContinueToUse`
- `net/minecraft/world/entity/animal/sniffer/Sniffer.transitionTo(Lnet/minecraft/world/entity/animal/sniffer/Sniffer$State;)Lnet/minecraft/world/entity/animal/sniffer/Sniffer;`, called by `SnifferAi$Digging.start`, `SnifferAi$FeelingHappy.start`, `SnifferAi$FeelingHappy.stop`, `SnifferAi$FinishedDigging.start`, `SnifferAi$FinishedDigging.stop`, `SnifferAi$Scenting.start`, `SnifferAi$Scenting.stop`, `SnifferAi$Searching.canStillUse`, `SnifferAi$Searching.start`, `SnifferAi$Sniffing.start`, `SnifferAi$Sniffing.stop`, `SnifferAi.resetSniffing`
- `net/minecraft/world/entity/AreaEffectCloud.setRadius(F)V`, called by `Creeper.explodeCreeper`, `DragonSittingFlamingPhase.doServerTick`
- `net/minecraft/world/entity/decoration/ItemFrame.setItem(Lnet/minecraft/world/item/ItemStack;Z)V`, called by `EndCityPieces$EndCityPiece.handleDataMarker`
- `net/minecraft/world/entity/Entity.applyEffectsFromBlocks(Lnet/minecraft/world/phys/Vec3;Lnet/minecraft/world/phys/Vec3;)V`, called by `PistonMovingBlockEntity.moveCollidedEntities`
- `net/minecraft/world/entity/Entity.isInLava()Z`, called by `Strider$StriderGoToLavaGoal.canContinueToUse`, `Strider$StriderGoToLavaGoal.canUse`
- `net/minecraft/world/entity/Entity.isInLiquid()Z`, called by `ArmadilloAi$ArmadilloBallUp.checkExtraStartConditions`
- `net/minecraft/world/entity/Entity.isInWater()Z`, called by `AxolotlAi.canSetWalkTargetFromLookTarget`, `AxolotlAi.getSpeedModifier`, `CamelAi$RandomSitting.checkExtraStartConditions`, `NautilusAi.findNearestValidAttackTarget`, `Panda$PandaSitGoal.canContinueToUse`, `Panda$PandaSitGoal.canUse`, `RandomStroll.stroll(FZ)Lnet/minecraft/world/entity/ai/behavior/OneShot;`, `Squid$SquidFleeGoal.canUse`
- `net/minecraft/world/entity/Entity.push(DDD)V`, called by `AbstractArrow.doKnockback`, `EnderDragon.aiStep`, `HoglinBase.throwTarget`, `Ravager.roar`, `SkeletonTrapGoal.tick`
- `net/minecraft/world/entity/Entity.setXRot(F)V`, called by `Fox$FoxPounceGoal.tick`
- `net/minecraft/world/entity/Entity.setYRot(F)V`, called by `BackUpIfTooClose.create`, `DragonSittingScanningPhase.doServerTick`, `Leashable.tickLeash`
- `net/minecraft/world/entity/Entity$Movement.<init>(Lnet/minecraft/world/phys/Vec3;Lnet/minecraft/world/phys/Vec3;)V`, called by `Entity.move`
- `net/minecraft/world/entity/Entity$Movement.<init>(Lnet/minecraft/world/phys/Vec3;Lnet/minecraft/world/phys/Vec3;Lnet/minecraft/world/phys/Vec3;)V`, called by `Entity.move`
- `net/minecraft/world/entity/item/FallingBlockEntity.fall(Lnet/minecraft/world/level/Level;Lnet/minecraft/core/BlockPos;Lnet/minecraft/world/level/block/state/BlockState;)Lnet/minecraft/world/entity/item/FallingBlockEntity;`, called by `SpeleothemBlock.spawnFallingStalactite`
- `net/minecraft/world/entity/LivingEntity.setHealth(F)V`, called by `PlayerList.respawn`
- `net/minecraft/world/entity/Mob.tick()V`, called by `AbstractSchoolingFish.tick`
- `net/minecraft/world/entity/player/Player.giveExperiencePoints(I)V`, called by `ExperienceOrb.playerTouch`
- `net/minecraft/world/entity/player/Player.isHurt()Z`, called by `FoodData.tick`
- `net/minecraft/world/entity/player/Player.tick()V`, called by `ServerPlayer.doTick`
- `net/minecraft/world/entity/raid/Raid.<init>(Lnet/minecraft/core/BlockPos;Lnet/minecraft/world/Difficulty;)V`, called by `Raids.createOrExtendRaid`
- `net/minecraft/world/entity/raid/Raid.absorbRaidOmen(Lnet/minecraft/server/level/ServerPlayer;)Z`, called by `Raids.createOrExtendRaid`
- `net/minecraft/world/entity/SulfurCubeArchetype$SoundSettings.hitSound()Lnet/minecraft/core/Holder;`, called by `SulfurCube.knockback`
- `net/minecraft/world/entity/vehicle/minecart/AbstractMinecart.comeOffTrack(Lnet/minecraft/server/level/ServerLevel;)V`, called by `OldMinecartBehavior.tick`
- `net/minecraft/world/item/component/BlocksAttacks$DamageReduction.resolve(Lnet/minecraft/world/damagesource/DamageSource;FD)F`, called by `BlocksAttacks.resolveBlockedDamage`
- `net/minecraft/world/item/DyeColor.getMapColor()Lnet/minecraft/world/level/material/MapColor;`, called by `Blocks.SNOW`
- `net/minecraft/world/item/DyeColor.getTerracottaColor()Lnet/minecraft/world/level/material/MapColor;`, called by `Blocks.SNOW`
- `net/minecraft/world/item/enchantment/EnchantmentHelper.enchantItemFromProvider(Lnet/minecraft/world/item/ItemStack;Lnet/minecraft/core/RegistryAccess;Lnet/minecraft/resources/ResourceKey;Lnet/minecraft/world/DifficultyInstance;Lnet/minecraft/util/RandomSource;)V`, called by `SkeletonTrapGoal.tick`
- `net/minecraft/world/item/ItemStack.getDamageValue()I`, called by `ExperienceOrb.playerTouch`
- `net/minecraft/world/item/ItemStack.setDamageValue(I)V`, called by `ExperienceOrb.playerTouch`
- `net/minecraft/world/level/block/AmethystClusterBlock.<init>(FFLnet/minecraft/world/level/block/state/BlockBehaviour$Properties;)V`, called by `Blocks.SNOW`
- `net/minecraft/world/level/block/Block.<init>(Lnet/minecraft/world/level/block/state/BlockBehaviour$Properties;)V`, called by `Blocks.SNOW`
- `net/minecraft/world/level/block/ButtonBlock.<init>(Lnet/minecraft/world/level/block/state/properties/BlockSetType;ILnet/minecraft/world/level/block/state/BlockBehaviour$Properties;)V`, called by `Blocks.SNOW`
- `net/minecraft/world/level/block/CaveVines.hasGlowBerries(Lnet/minecraft/world/level/block/state/BlockState;)Z`, called by `Fox$FoxEatBerriesGoal.isValidTarget`, `Fox$FoxEatBerriesGoal.onReachedTarget`
- `net/minecraft/world/level/block/CeilingHangingSignBlock.<init>(Lnet/minecraft/world/level/block/state/properties/WoodType;Lnet/minecraft/world/level/block/state/BlockBehaviour$Properties;)V`, called by `Blocks.SNOW`
- `net/minecraft/world/level/block/ComposterBlock.extractProduce(Lnet/minecraft/world/entity/Entity;Lnet/minecraft/world/level/block/state/BlockState;Lnet/minecraft/world/level/Level;Lnet/minecraft/core/BlockPos;)Lnet/minecraft/world/level/block/state/BlockState;`, called by `WorkAtComposter.useWorkstation`
- `net/minecraft/world/level/block/ComposterBlock.insertItem(Lnet/minecraft/world/entity/Entity;Lnet/minecraft/world/level/block/state/BlockState;Lnet/minecraft/server/level/ServerLevel;Lnet/minecraft/world/item/ItemStack;Lnet/minecraft/core/BlockPos;)Lnet/minecraft/world/level/block/state/BlockState;`, called by `WorkAtComposter.useWorkstation`
- `net/minecraft/world/level/block/DoorBlock.<init>(Lnet/minecraft/world/level/block/state/properties/BlockSetType;Lnet/minecraft/world/level/block/state/BlockBehaviour$Properties;)V`, called by `Blocks.SNOW`
- `net/minecraft/world/level/block/FenceGateBlock.<init>(Lnet/minecraft/world/level/block/state/properties/WoodType;Lnet/minecraft/world/level/block/state/BlockBehaviour$Properties;)V`, called by `Blocks.SNOW`
- `net/minecraft/world/level/block/LeavesBlock.<init>(Lnet/minecraft/world/level/block/sounds/AmbientLeavesBlockSoundPlayer;Lnet/minecraft/world/level/block/state/BlockBehaviour$Properties;)V`, called by `Blocks.SNOW`
- `net/minecraft/world/level/block/LiquidBlock.<init>(Lnet/minecraft/world/level/material/FlowingFluid;Lnet/minecraft/world/level/block/state/BlockBehaviour$Properties;)V`, called by `Blocks.SNOW`
- `net/minecraft/world/level/block/LiquidBlockContainer.canPlaceLiquid(Lnet/minecraft/world/entity/LivingEntity;Lnet/minecraft/world/level/BlockGetter;Lnet/minecraft/core/BlockPos;Lnet/minecraft/world/level/block/state/BlockState;Lnet/minecraft/world/level/material/Fluid;)Z`, called by `FlowingFluid.getSpread`
- `net/minecraft/world/level/block/SculkSensorBlock.getStateForPlacement(Lnet/minecraft/world/item/context/BlockPlaceContext;)Lnet/minecraft/world/level/block/state/BlockState;`, called by `CalibratedSculkSensorBlock.getStateForPlacement`
- `net/minecraft/world/level/block/sounds/AmbientLeavesBlockSoundPlayer.noAmbientSound()Lnet/minecraft/world/level/block/sounds/AmbientLeavesBlockSoundPlayer;`, called by `Blocks.SNOW`
- `net/minecraft/world/level/block/sounds/AmbientLeavesBlockSoundPlayer.of(Lnet/minecraft/core/Holder;Lnet/minecraft/tags/TagKey;)Lnet/minecraft/world/level/block/sounds/AmbientLeavesBlockSoundPlayer;`, called by `Blocks.SNOW`
- `net/minecraft/world/level/block/StandingSignBlock.<init>(Lnet/minecraft/world/level/block/state/properties/WoodType;Lnet/minecraft/world/level/block/state/BlockBehaviour$Properties;)V`, called by `Blocks.SNOW`
- `net/minecraft/world/level/block/state/BlockBehaviour$Properties.of()Lnet/minecraft/world/level/block/state/BlockBehaviour$Properties;`, called by `Blocks.SNOW`
- `net/minecraft/world/level/block/state/BlockBehaviour$Properties.offsetType(Lnet/minecraft/world/level/block/state/BlockBehaviour$OffsetType;)Lnet/minecraft/world/level/block/state/BlockBehaviour$Properties;`, called by `Blocks.SNOW`
- `net/minecraft/world/level/block/state/BlockBehaviour$Properties.ofLegacyCopy(Lnet/minecraft/world/level/block/state/BlockBehaviour;)Lnet/minecraft/world/level/block/state/BlockBehaviour$Properties;`, called by `Blocks.SNOW`
- `net/minecraft/world/level/block/state/BlockBehaviour$Properties.sound(Lnet/minecraft/world/level/block/SoundType;)Lnet/minecraft/world/level/block/state/BlockBehaviour$Properties;`, called by `Blocks.SNOW`
- `net/minecraft/world/level/block/TintedParticleLeavesBlock.<init>(FLnet/minecraft/world/level/block/state/BlockBehaviour$Properties;)V`, called by `Blocks.SNOW`
- `net/minecraft/world/level/block/TrapDoorBlock.<init>(Lnet/minecraft/world/level/block/state/properties/BlockSetType;Lnet/minecraft/world/level/block/state/BlockBehaviour$Properties;)V`, called by `Blocks.SNOW`
- `net/minecraft/world/level/block/UntintedParticleLeavesBlock.<init>(FLnet/minecraft/core/particles/ParticleOptions;Lnet/minecraft/world/level/block/sounds/AmbientLeavesBlockSoundPlayer;Lnet/minecraft/world/level/block/state/BlockBehaviour$Properties;)V`, called by `Blocks.SNOW`
- `net/minecraft/world/level/block/WallHangingSignBlock.<init>(Lnet/minecraft/world/level/block/state/properties/WoodType;Lnet/minecraft/world/level/block/state/BlockBehaviour$Properties;)V`, called by `Blocks.SNOW`
- `net/minecraft/world/level/block/WallSignBlock.<init>(Lnet/minecraft/world/level/block/state/properties/WoodType;Lnet/minecraft/world/level/block/state/BlockBehaviour$Properties;)V`, called by `Blocks.SNOW`
- `net/minecraft/world/level/BlockGetter.forEachBlockIntersectedBetween(Lnet/minecraft/world/phys/Vec3;Lnet/minecraft/world/phys/Vec3;Lnet/minecraft/world/phys/AABB;Lnet/minecraft/world/level/BlockGetter$BlockStepVisitor;)Z`, called by `Entity.checkInsideBlocks(Lnet/minecraft/world/phys/Vec3;Lnet/minecraft/world/phys/Vec3;Lnet/minecraft/world/entity/InsideBlockEffectApplier$StepBasedCollector;Lit/unimi/dsi/fastutil/longs/LongSet;I)I`
- `net/minecraft/world/level/border/WorldBorder.isInsideCloseToBorder(Lnet/minecraft/world/entity/Entity;Lnet/minecraft/world/phys/AABB;)Z`, called by `Entity.collide`, `Entity.move`
- `net/minecraft/world/level/Level.explode(Lnet/minecraft/world/entity/Entity;DDDFLnet/minecraft/world/level/Level$ExplosionInteraction;)V`, called by `Creeper.explodeCreeper`
- `net/minecraft/world/level/Level.explode(Lnet/minecraft/world/entity/Entity;Lnet/minecraft/world/damagesource/DamageSource;Lnet/minecraft/world/level/ExplosionDamageCalculator;DDDFZLnet/minecraft/world/level/Level$ExplosionInteraction;)V`, called by `EndCrystal.hurtServer`
- `net/minecraft/world/level/Level.getEntities(Lnet/minecraft/world/entity/Entity;Lnet/minecraft/world/phys/AABB;Ljava/util/function/Predicate;)Ljava/util/List;`, called by `EnderDragon.aiStep`, `LightningBolt.tick`
- `net/minecraft/world/level/Level.isDebug()Z`, called by `ServerChunkCache.tickChunks()V`
- `net/minecraft/world/level/levelgen/structure/BoundingBox.<init>(IIIIII)V`, called by `MineshaftPieces$MineShaftCorridor.findCorridorSize`, `MineshaftPieces$MineShaftCrossing.findCrossing`, `MineshaftPieces$MineShaftStairs.findStairs`, `StructurePiece.makeBoundingBox`
- `net/minecraft/world/level/levelgen/structure/pieces/StructurePiecesBuilder.<init>()V`, called by `Structure$GenerationStub.getPiecesBuilder`
- `net/minecraft/world/level/levelgen/structure/structures/NetherFortressPieces$StartPiece.<init>(Lnet/minecraft/util/RandomSource;II)V`, called by `NetherFortressStructure.generatePieces`
- `net/minecraft/world/level/levelgen/structure/StructureStart.isValid()Z`, called by `ChunkGenerator.findNearestMapStructure`
- `net/minecraft/world/level/LevelReader.getBiome(Lnet/minecraft/core/BlockPos;)Lnet/minecraft/core/Holder;`, called by `Drowned.finalizeSpawn`, `MapItem.renderBiomePreviewMap`
- `net/minecraft/world/level/LocalMobCapCalculator.<init>(Lnet/minecraft/server/level/ChunkMap;)V`, called by `ServerChunkCache.tickChunks()V`
- `net/minecraft/world/level/material/FlowingFluid.getSource(Z)Lnet/minecraft/world/level/material/FluidState;`, called by `BubbleColumnBlock.getFluidState`
- `net/minecraft/world/level/material/Fluid.isSame(Lnet/minecraft/world/level/material/Fluid;)Z`, called by `FlowingFluid.getSpread`
- `net/minecraft/world/level/material/FluidState.canBeReplacedWith(Lnet/minecraft/world/level/BlockGetter;Lnet/minecraft/core/BlockPos;Lnet/minecraft/world/level/material/Fluid;Lnet/minecraft/core/Direction;)Z`, called by `FlowingFluid.getSpread`
- `net/minecraft/world/level/storage/loot/LootParams$Builder.<init>(Lnet/minecraft/server/level/ServerLevel;)V`, called by `ItemCommands.applyModifier`
- `net/minecraft/world/level/storage/TagValueInput.create(Lnet/minecraft/util/ProblemReporter;Lnet/minecraft/core/HolderLookup$Provider;Lnet/minecraft/nbt/CompoundTag;)Lnet/minecraft/world/level/storage/ValueInput;`, called by `FallingBlockEntity.tick`
- `net/minecraft/world/level/storage/TagValueOutput.createWithContext(Lnet/minecraft/util/ProblemReporter;Lnet/minecraft/core/HolderLookup$Provider;)Lnet/minecraft/world/level/storage/TagValueOutput;`, called by `FallingBlockEntity.tick`
- `net/minecraft/world/phys/AABB.ofSize(Lnet/minecraft/world/phys/Vec3;DDD)Lnet/minecraft/world/phys/AABB;`, called by `Entity.isInWall`, `Painting.calculateBoundingBox`
- `net/minecraft/world/phys/shapes/Shapes.joinIsNotEmpty(Lnet/minecraft/world/phys/shapes/VoxelShape;Lnet/minecraft/world/phys/shapes/VoxelShape;Lnet/minecraft/world/phys/shapes/BooleanOp;)Z`, called by `Entity.isInWall`
- `net/minecraft/world/phys/shapes/VoxelShape.bounds()Lnet/minecraft/world/phys/AABB;`, called by `PistonMovingBlockEntity.moveCollidedEntities`
- `net/minecraft/world/phys/shapes/VoxelShape.toAabbs()Ljava/util/List;`, called by `AbstractArrow.tick`, `Blocks.SNOW`, `Entity.checkInsideBlocks(Lnet/minecraft/world/phys/Vec3;Lnet/minecraft/world/phys/Vec3;Lnet/minecraft/world/entity/InsideBlockEffectApplier$StepBasedCollector;Lit/unimi/dsi/fastutil/longs/LongSet;I)I`, `PistonMovingBlockEntity.moveCollidedEntities`

## Sources

- Mojang piston-meta version manifest, `https://piston-meta.mojang.com/mc/game/version_manifest_v2.json`,
  and the 26.4-snapshot-10 and 26.4-pre-1 version packages it links.
- The generated data of both releases: `node_modules/.cache/jsprismarine/vanilla-datapack/<release>/`
  and `java-reports/<release>/generated/reports/`, from `datagen:java`.
- [Java Edition 26.4](https://minecraft.wiki/w/Java_Edition_26.4) and
  [Java Edition 26.4 Snapshot 10](https://minecraft.wiki/w/Java_Edition_26.4_Snapshot_10) and
  [Java Edition 26.4 Pre-Release 1](https://minecraft.wiki/w/Java_Edition_26.4_Pre-Release_1) on
  the Minecraft Wiki. Mojang's pre-release article on minecraft.net timed out from this host.
- `javap` over the server jars for the constructor and `BlockStateBase` signatures, and over
  Snapshot 10's and Pre-Release 1's `upscale` and `Camel` classes.
