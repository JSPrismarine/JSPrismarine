# Java 26.3 to 26.4 Snapshot 10 data delta

Research note, 2026-11-19. Question: what changed in the vanilla datapack and the data generator
reports between Java Edition 26.3, the release this server runs, and 26.4 Snapshot 10, the
preview it tracks, and which of those changes the loaders have to gate.

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
`pnpm run bringup:java --java 26.4-snapshot-10`.

## Which release this is

| Key               | 26.3          | 26.4 Snapshot 10   |
| ----------------- | ------------- | ------------------ |
| Release id        | `26.3`        | `26.4-snapshot-10` |
| Data pack format  | 121.0         | 128.0              |
| Data version      | 5023          | 5130               |
| JDK               | 25            | 25                 |
| Server jar sha1   | `33680f5f…`   | `d7135161…`        |

Both rows come from the `version.json` `datagen:java` writes beside each datapack, which reads
the jar's own `version.json`. The pin is the newest snapshot in Mojang's piston-meta version
manifest on 2026-11-19 (`latest.snapshot`, released 2026-11-17). The URL and sha1 come from its
version package. The sha256 (`54648ab1…`) and the size (63998326 bytes) were measured on
download. Snapshot 8, which the plan named, had format 127.0 and data version 5128. Snapshot 10
moved the format major once more, so it is the pin.

## How the delta was derived

```sh
pnpm --filter @jsprismarine/bedrock-data run datagen:java --java 26.3
pnpm --filter @jsprismarine/bedrock-data run datagen:java --java 26.4-snapshot-10
pnpm --filter @jsprismarine/bedrock-data run java:diff 26.3 26.4-snapshot-10 --out /tmp/java-delta.md
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

## Sources

- Mojang piston-meta version manifest, `https://piston-meta.mojang.com/mc/game/version_manifest_v2.json`,
  and the 26.4-snapshot-10 version package it links.
- The generated data of both releases: `node_modules/.cache/jsprismarine/vanilla-datapack/<release>/`
  and `java-reports/<release>/generated/reports/`, from `datagen:java`.
- [Java Edition 26.4](https://minecraft.wiki/w/Java_Edition_26.4) and
  [Java Edition 26.4 Snapshot 10](https://minecraft.wiki/w/Java_Edition_26.4_Snapshot_10) on the
  Minecraft Wiki.
- `javap` over both releases' server jars for the constructor and `BlockStateBase` signatures.
