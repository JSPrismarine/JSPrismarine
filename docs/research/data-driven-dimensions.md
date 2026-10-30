# Data-driven dimensions and generators

Researched 2026-10-30. Scope: how Java Edition 26.3 describes a dimension and its generator as data, how Bedrock 1.26.x models dimensions on disk and on the wire, what this repository already parses and sends, how six other servers handle multiple dimensions, and a design for making JSPrismarine's dimensions and generators data-driven with real multi-dimension worlds. Java facts come from the pinned 26.3 vanilla datapack and data generator reports in `node_modules/.cache/jsprismarine/`, with the Minecraft Wiki as a secondary source for field semantics. Bedrock wire facts come from Mojang's `bedrock-protocol-docs` JSON schemas (1.26.60-beta.0, protocol 2225) and Sandertv's gophertunnel. Prior art comes from each project's source. Every claim names its source. Builds on [cross-edition-worldgen-parity.md](cross-edition-worldgen-parity.md) and [java-datapacks.md](java-datapacks.md) and repeats neither.

## Summary

- Java splits a dimension into three data objects. A `dimension_type` is the physics of a dimension (height bounds, coordinate scale, light, spawn rules). A level stem, stored under `dimension/` or inline in a `worldgen/world_preset`, binds a type to a generator. A generator is a tagged union on `type`: `minecraft:noise` (a `noise_settings` reference plus a `biome_source`), `minecraft:flat` (layers, biome, structure overrides) or `minecraft:debug`. The vanilla datapack ships no `dimension/` folder; the three vanilla stems exist only inside the seven world presets.
- Since 1.21.11 and 25w45a, Java has moved most of the boolean dimension fields (`ultrawarm`, `bed_works`, `respawn_anchor_works`, `piglin_safe`, `has_raids`, `natural`) into an `attributes` map of environment attributes, replaced `effects` with `skybox` and `cardinal_light`, and replaced `fixed_time` with `has_fixed_time`. The 26.3 files in the cache have the new shape, so a loader written from the pre-1.21.11 field list would read nothing useful.
- Java's Nether type is `min_y 0, height 256, logical_height 128`. Bedrock's Nether is 0 to 128 everywhere that matters (the client, Geyser, PowerNukkitX, Dragonfly, Allay). The Overworld (-64, 384) and End (0, 256) agree. Any Bedrock overlay on Java dimension types has to carry a height override for the Nether.
- Bedrock identifies a dimension by a small integer (0, 1, 2) in every chunk key, in `StartGame`, `ChangeDimension`, `LevelChunk`, `SubChunk` and `SetSpawnPosition`. All dimensions of a world share one LevelDB directory. `level.dat` has `Generator` (1 infinite, 2 flat, 5 void), `FlatWorldLayers` (JSON for the flat Overworld only) and `NetherScale` (default 8).
- Bedrock now has custom dimensions, which the task brief said it lacked. Preview 26.20.26 added `StartupEvent.dimensionRegistry.registerCustomDimension(typeId)` (stable in 26.30.29), and preview 26.50.25 added behavior pack `dimension/*.json` with `minecraft:dimension_height`, `minecraft:default_biome` and `minecraft:generation` components. The only generator is `void`, and vanilla dimensions cannot be redefined. The client learns about them through `DimensionDataPacket` (id 180): a map of identifier to definition with `Minimum Y`, `Height Range`, `Generator Type`, `Dimension Type` (runtime id, 1000 and up for custom), `Pack Id`, `Default Biome`, and at protocol 2225 `Cloud Height` and `Render Clouds`.
- This repository has the packets (`DimensionDataPacket`, `ChangeDimensionPacket`, both directions) but never sends `DimensionData`, lacks the two 2225 cloud fields, and `Player.setWorld` always leaves the client in dimension 0. `@jsprismarine/worldgen` already has every biome source class (`MultiNoiseBiomeSource`, `FixedBiomeSource`, `CheckerboardBiomeSource`, `TheEndBiomeSource`) and all seven noise settings parse, but nothing reads `dimension_type`, `world_preset`, `flat_level_generator_preset` or `multi_noise_biome_source_parameter_list`, `DataDrivenGenerator` is typed to `MultiNoiseBiomeSource`, and `@jsprismarine/packs` drops `data/*/worldgen/**` and `data/*/dimension_type/**` on the floor.
- Of the six peers, only Pumpkin loads Java's model as data (it generates a `Dimension` struct per `dimension_type` file and reads `world_gen_settings.dat` stems). PowerNukkitX, Cloudburst and Allay register generator factories by name and configure each dimension of a world with `{ generator name, preset string }`. Dragonfly and Allay register custom dimensions by numeric id and send `DimensionData`.
- Recommendation: adopt Java's model as the internal one. A `DimensionType` registry loaded from `dimension_type` JSON with a Bedrock overlay from `@jsprismarine/mapping`; a `LevelStem` per dimension built from a world preset plus per-dimension overrides in config; a `GeneratorFactories` registry keyed by generator kind id; one `Level` per `worlds.<name>` entry owning one seed, one LevelDB directory and one `World` per stem. Parsing lives in `@jsprismarine/worldgen`, pack routing in `@jsprismarine/packs`, the edition overlay in `@jsprismarine/mapping`, the runtime in `@jsprismarine/prismarine`. The existing `generator: 'Overworld' | 'Flat'` config maps onto `preset: 'minecraft:normal'` and `preset: 'minecraft:flat'` and keeps working through a translation step.

## 1. Java's model

### 1.1 `dimension_type`

Files live at `data/<namespace>/dimension_type/<name>.json`, not under `worldgen/`. The 26.3 datapack has four: `overworld`, `overworld_caves`, `the_nether`, `the_end` (`node_modules/.cache/jsprismarine/vanilla-datapack/26.3/data/minecraft/dimension_type/`). The field list below is the 26.3 shape as read from those files, with semantics from the wiki's [Dimension type](https://minecraft.wiki/w/Dimension_type) page.

| Field | Type | Overworld | Nether | End | Meaning |
|---|---|---|---|---|---|
| `min_y` | int | -64 | 0 | 0 | Lowest block y. Multiple of 16, -2032 to 2031. |
| `height` | int | 384 | 256 | 256 | Blocks from `min_y` upward. Multiple of 16, 16 to 4064. |
| `logical_height` | int | 384 | 128 | 256 | Ceiling for chorus fruit and portal placement. At most `height`. |
| `coordinate_scale` | double | 1.0 | 8.0 | 1.0 | Multiplier applied to x and z when leaving the dimension. |
| `has_skylight` | bool | true | false | true | Sky light exists; false also disables weather. |
| `has_ceiling` | bool | false | true | false | Logical bedrock ceiling; changes respawn and map behavior. |
| `has_fixed_time` | bool | absent (false) | true | true | Replaced `fixed_time` in 25w45a. |
| `has_ender_dragon_fight` | bool | false | false | true | Added in 26.1 snap6. |
| `ambient_light` | float | 0.0 | 0.1 | 0.25 | Light added to every block. |
| `monster_spawn_light_level` | int or int provider | uniform 0 to 7 | 7 | 15 | Monster spawn light test. |
| `monster_spawn_block_light_limit` | int | 0 | 15 | 0 | Block light must be at most this. |
| `infiniburn` | string | `#minecraft:infiniburn_overworld` | `#minecraft:infiniburn_nether` | `#minecraft:infiniburn_end` | Block tag; since 26.2 also an id or list. |
| `skybox` | string | absent (`overworld`) | `none` | `end` | Replaced `effects` in 25w45a. |
| `cardinal_light` | string | absent (`default`) | `nether` | absent | Replaced `effects` in 25w45a. |
| `default_clock` | string | `minecraft:overworld` | absent | `minecraft:the_end` | World clock for `/time` and sleep. Added 26.1 snap3. |
| `timelines` | string or list | `#minecraft:in_overworld` | `#minecraft:in_nether` | `#minecraft:in_end` | Added 25w45a. |
| `attributes` | map | see below | see below | see below | Environment attributes, added 1.21.11 (25w42a). |

The attributes that used to be top-level booleans (wiki history table, 25w42a and 25w45a entries):

| Old field | Attribute | Overworld | Nether | End |
|---|---|---|---|---|
| `ultrawarm` | `minecraft:gameplay/water_evaporates`, `minecraft:gameplay/fast_lava`, `minecraft:visual/default_dripstone_particle` | absent | `true`, `true`, dripping lava | absent |
| `bed_works` | `minecraft:gameplay/bed_rule` | `can_sleep: when_dark`, `can_set_spawn: always` | `can_sleep: never`, `can_set_spawn: never`, `destroy_on_use: true` | same as Nether |
| `respawn_anchor_works` | `minecraft:gameplay/respawn_anchor_works` | false | true | false |
| `piglin_safe` | `minecraft:gameplay/piglins_zombify` | absent (true) | false | absent |
| `has_raids` | `minecraft:gameplay/can_start_raid` | absent (true) | false | absent |
| `natural` | `minecraft:gameplay/nether_portal_spawns_piglin`, `eyeblossom_open`, `creaking_active` | `nether_portal_spawns_piglin: true` | absent | absent |
| (visual) | `minecraft:visual/cloud_height`, `fog_color`, `sky_color`, `ambient_light_color`, `sky_light_color`, `sky_light_factor`, `fog_start_distance`, `fog_end_distance` | cloud height 192.33, fog `#c0d8ff`, sky `#78a7ff` | fog 10 to 96, sky light factor 0 | sky `#000000`, fog `#181318` |
| (new) | `minecraft:gameplay/sky_light_level`, `snow_golem_melts`, `straw_bed_rule`, `minecraft:audio/*` | ambient sounds, background music | sky light level 4.0, snow golems melt | background music |

`overworld_caves.json` equals `overworld.json` except `"has_ceiling": true`. Since 22w11a a stem must reference a `dimension_type` file; inline types are gone (wiki history).

### 1.2 Level stems and world presets

A level stem is `{ "type": <dimension_type id>, "generator": { "type": <generator kind>, ... } }`. It can live at `data/<namespace>/dimension/<name>.json`, which overrides the same key in whichever preset the world uses, or inline under `dimensions` in `data/<namespace>/worldgen/world_preset/<name>.json` (wiki [Dimension definition](https://minecraft.wiki/w/Dimension_definition) and [World preset definition](https://minecraft.wiki/w/World_preset_definition)). The vanilla datapack has no `dimension/` directory; its stems are only inside the presets.

The datapack's `worldgen/world_preset/` has seven files. `normal.json`, verbatim:

```json
{
  "dimensions": {
    "minecraft:overworld": {
      "type": "minecraft:overworld",
      "generator": {
        "type": "minecraft:noise",
        "biome_source": { "type": "minecraft:multi_noise", "preset": "minecraft:overworld" },
        "settings": "minecraft:overworld"
      }
    },
    "minecraft:the_end": {
      "type": "minecraft:the_end",
      "generator": {
        "type": "minecraft:noise",
        "biome_source": { "type": "minecraft:the_end" },
        "settings": "minecraft:end"
      }
    },
    "minecraft:the_nether": {
      "type": "minecraft:the_nether",
      "generator": {
        "type": "minecraft:noise",
        "biome_source": { "type": "minecraft:multi_noise", "preset": "minecraft:nether" },
        "settings": "minecraft:nether"
      }
    }
  }
}
```

Every other preset except `flat_all_dimensions` keeps the Nether and End stems above and changes only `minecraft:overworld`:

| Preset | Overworld generator | In tag |
|---|---|---|
| `minecraft:normal` | noise, `multi_noise` preset `minecraft:overworld`, settings `minecraft:overworld` | `#minecraft:normal` |
| `minecraft:large_biomes` | same, settings `minecraft:large_biomes` | `#minecraft:normal` |
| `minecraft:amplified` | same, settings `minecraft:amplified` | `#minecraft:normal` |
| `minecraft:single_biome_surface` | noise, `{ "type": "minecraft:fixed", "biome": "minecraft:plains" }`, settings `minecraft:overworld` | `#minecraft:normal` |
| `minecraft:flat` | `minecraft:flat` with biome plains, bedrock 1, dirt 2, grass_block 1, `features: false`, `lakes: false`, `structure_overrides: ["minecraft:strongholds", "minecraft:villages"]` | `#minecraft:normal` |
| `minecraft:debug_all_block_states` | `{ "type": "minecraft:debug" }` | `#minecraft:extended` |
| `minecraft:flat_all_dimensions` | flat in all three: desert over bedrock 1 and sandstone 67; End `the_end` over bedrock 1 and end_stone 3; Nether `basalt_deltas` over bedrock 1 and basalt 3 | neither |

`tags/worldgen/world_preset/normal.json` lists the five shown in the world type button; `extended.json` adds `debug_all_block_states` behind Alt (both verbatim in the cache). Only `minecraft:overworld` is mandatory in a preset (wiki).

Where a Java world records its choice: before 26.1 the `WorldGenSettings` compound in `level.dat` held `seed`, `generate_features`, `bonus_chest` and `dimensions`, a map of stem id to `{ type, generator }`. 26.1 snap6 moved it to `data/minecraft/world_gen_settings.dat` and renamed `generate_features` to `generate_structures` (wiki [Java Edition level format](https://minecraft.wiki/w/Java_Edition_level_format), history). Pumpkin's `WorldGenSettings { seed: i64, dimensions: HashMap<String, Dimension { type, generator: Generator { type, settings?: Reference | Compound, biome_source? } }> }` is a working deserializer of that compound ([pumpkin-world/src/world_info/mod.rs](https://github.com/Pumpkin-MC/Pumpkin/blob/master/crates/pumpkin-world/src/world_info/mod.rs)). Since 22w11a stems carry no per-dimension seed; the world seed applies to all (wiki history).

### 1.3 Generator kinds

`minecraft:noise` takes `settings`, a `worldgen/noise_settings` id or an inline object, and `biome_source`. The 26.3 noise settings are `overworld`, `large_biomes`, `amplified`, `caves`, `floating_islands`, `nether`, `end`. `@jsprismarine/worldgen` parses all seven (`packages/worldgen/README.md`, "all seven dimensions").

`minecraft:flat` takes `settings` (wiki [Superflat/Settings](https://minecraft.wiki/w/Superflat/Settings)):

| Field | Default | Meaning |
|---|---|---|
| `layers` | required, may be empty | List of `{ "height": 0..4064, "block": id }`, read bottom up from `min_y`. |
| `biome` | `minecraft:plains` | The single biome. |
| `lakes` | false | Lava lakes. |
| `features` | false | Biome placed features, except the two structure steps. |
| `structure_overrides` | all structure sets | Structure set id, tag, or list of ids. |

The same object is the `settings` of a `worldgen/flat_level_generator_preset/<name>.json`, which adds `display` (an item id). The datapack ships nine: `bottomless_pit`, `classic_flat`, `desert`, `overworld`, `redstone_ready`, `snowy_kingdom`, `the_void`, `tunnelers_dream`, `water_world`. Note the field name: Java layers use `height`, this server's `FlatLayer` uses `size` (`packages/prismarine/src/config/JsonConfigTypes.ts`).

`minecraft:debug` has no fields.

### 1.4 Biome sources

From the wiki's Dimension definition page, with the matching class in `packages/worldgen/src/biome/BiomeSource.ts`:

| `type` | Fields | Class here |
|---|---|---|
| `minecraft:multi_noise` | `preset` (id of a `multi_noise_biome_source_parameter_list`) or `biomes` (list of `{ biome, parameters }`) | `MultiNoiseBiomeSource.fromJson` accepts a `{ biomes }` document or an array; it does not resolve `preset`. |
| `minecraft:fixed` | `biome` | `FixedBiomeSource(biome)` |
| `minecraft:checkerboard` | `biomes` (list or tag), `scale` 0 to 62, default 2 | `CheckerboardBiomeSource(biomes, scale)` |
| `minecraft:the_end` | none; the end biome within 1024 blocks, else by erosion at the chunk center | `TheEndBiomeSource()` |

The two `multi_noise_biome_source_parameter_list` files are stubs: `overworld.json` is `{"preset": "minecraft:overworld"}` and `nether.json` is `{"preset": "minecraft:nether"}`. The parameter points come from the data generator's `reports/biome_parameters/minecraft/{overworld,nether}.json` (7594 and 5 points, per the worldgen README), which `javaWorldgenData.ts` already loads as `biomeParameters`. There is no `parseBiomeSource(json)` dispatch on `type` in the repository.

### 1.5 What the repository already does

Paths are relative to the repository root.

- `packages/prismarine/src/world/generators/datadriven/javaWorldgenData.ts` reads `worldgen/{density_function, noise, noise_settings, material_rule, material_condition, carver, biome, feature, placed_feature, block_state_provider, processor_list, structure, structure_set, template_pool}`, `tags/block`, `tags/worldgen/biome` and the biome parameter reports, straight from the cache directory rather than through the pack stack. It does not read `dimension_type`, `world_preset`, `dimension`, `flat_level_generator_preset` or `multi_noise_biome_source_parameter_list`.
- `DataDrivenGenerator` (`generators/datadriven/DataDrivenGenerator.ts`) accepts `dimension?`, `noiseSettings?` and `biomeParameters?` and forwards them to worker pools, but its `biomeSource` field is typed `MultiNoiseBiomeSource` (lines 604 to 612), so the End cannot be built. `Overworld.ts` passes none of the three options.
- `packages/packs/src/javaRegistries.ts` returns `undefined` from `routeDatapackPath` for `data/*/worldgen/**` and `data/*/dimension_type/**`; `javaRegistries.test.ts:65-66` asserts it. `packages/prismarine/src/content/README.md` lists the worldgen registries as a known gap.
- `packages/mapping/src/packRegistries.ts` lists `worldgen/world_preset` and `worldgen/flat_level_generator_preset` as server-side registries for identifier checks only.
- Structure placement filters structure sets by the biomes a source can produce (`javaStructurePlacement.ts:9-10`), so the Nether's and End's sets stay out of the Overworld without naming a dimension. `javaStructureTypes.ts` has no builder for the end city or the nether fortress.

## 2. Bedrock's model

### 2.1 Ids, heights and scale

Bedrock names dimensions by integer: 0 Overworld, 1 Nether, 2 End (gophertunnel `packet/change_dimension.go` constants; `@jsprismarine/minecraft`'s `Dimension` enum adds `UNDEFINED` = 3, which Mojang's `ChangeDimensionPacketPayload.json` documents as "3 -> Undefined"). Heights are fixed per id in the client: Overworld -64 to 320, Nether 0 to 128, End 0 to 256. Geyser encodes exactly those as `BedrockDimension.OVERWORLD(-64, 384)`, `THE_NETHER(0, 128)`, `THE_END(0, 256)` and comments that "as of 1.18.30, biome count is representative of the height of the world, and out-of-bounds chunks can crash the client" ([BedrockDimension.java](https://github.com/GeyserMC/Geyser/blob/master/core/src/main/java/org/geysermc/geyser/level/BedrockDimension.java)). Geyser also works around the Nether's 128 ceiling by telling the client it is in the End and sending `minecraft:fog_hell` ([DimensionUtils.java](https://github.com/GeyserMC/Geyser/blob/master/core/src/main/java/org/geysermc/geyser/util/DimensionUtils.java)). The Nether coordinate scale is `NetherScale` in `level.dat`, default 8 (wiki [Bedrock Edition level format](https://minecraft.wiki/w/Bedrock_Edition_level_format), level.dat table).

The repository's `Dimensions` table (`packages/prismarine/src/world/Dimension.ts`) already uses the Bedrock heights, and its Nether is named `minecraft:nether` where Java says `minecraft:the_nether`; `command/host/support.ts:73-97` bridges the two names.

### 2.2 On disk

All dimensions of a world share one `db/` directory. A chunk key is x and z as int32 little-endian, then an optional int32 dimension (1 or 2; omitted for the Overworld, always present for `JigsawStructureBlueprint`), then the record tag, then for `SubChunkPrefix` a signed sub chunk index byte (wiki, "Chunk key format"). `packages/prismarine/src/world/providers/leveldb/LevelDBKeys.ts` encodes exactly this and `LevelDB.ts` takes the dimension from `this.getWorld().getDimension()`, so the provider is already dimension-aware but bound to one world per instance.

`level.dat` fields that matter here (wiki level.dat table): `Generator` int, "0 is Old, 1 is Infinite, 2 is Flat, 5 is Void"; `FlatWorldLayers`, a JSON string whose default is `{"biome_id":1,"block_layers":[{"block_name":"minecraft:bedrock","count":1},{"block_name":"minecraft:dirt","count":2},{"block_name":"minecraft:grass_block","count":1}],"encoding_version":6,"preset_id":"ClassicFlat","structure_options":null,"world_version":"version.post_1_18"}` and applies to the Overworld only; `NetherScale`; `RandomSeed` (long); `SpawnX/Y/Z`; `StorageVersion` 10. The player record's `Dimension` int says where the player is. `packages/prismarine/src/world/providers/leveldb/LevelDB.ts:704-720` writes `LevelName`, `RandomSeed`, `StorageVersion`, `lastOpenedWithVersion`, spawn and a `JSPrismarineSpawnKnown` byte, and never `Generator`, `FlatWorldLayers` or `NetherScale`. Flat layers live only in config.

### 2.3 Custom dimensions in Bedrock

The brief said add-ons cannot add dimensions. That was true until 2026. From the wiki's Dimension definition page (Bedrock section and history) and the Script API reference:

- Preview 26.20.26 added `StartupEvent.dimensionRegistry.registerCustomDimension(typeId: string)` behind Beta APIs; 26.30.29 moved it to stable. The method "Registers a new custom dimension type. Must be called during the system startup event. The dimension will be created using the void generator." ([DimensionRegistry](https://learn.microsoft.com/en-us/minecraft/creator/scriptapi/minecraft/server/dimensionregistry)).
- Preview 26.50.25 added behavior pack `<root BP>/dimension/<name>.json` with `minecraft:dimension` holding `description.identifier` and `components`: `minecraft:dimension_height { min_y, height_range }` (-512 to 512, multiple of 16, at most 1024 tall), `minecraft:default_biome { biome }`, `minecraft:generation { generator_type }` where "Currently only `void` is supported", and from 26.60 `minecraft:clouds { height }`. The same release stopped letting packs modify vanilla dimensions. A JSON definition takes priority over a script registration of the same id.

So Bedrock custom dimensions exist, but they are void and client-rendered only; the server decides what fills them. For JSPrismarine the Bedrock format is a possible input (a pack's `dimension/*.json` could map onto a stem with a void generator) but not a model for generation.

### 2.4 How the client learns a dimension

`StartGamePacket` carries `dimension: varint32` (the spawn dimension, 0 to 2) and `generator: varint32` (gophertunnel `start_game.go`: "0 being old limited worlds, 1 being infinite worlds, 2 being flat worlds, 3 being nether worlds and 4 being end worlds. A value of 0 will actually make the client stop rendering chunks you send beyond the world limit"). This server fills them in `packages/prismarine/src/network/startGameData.ts:64-80` as `dimension: world.getDimension().id` and `generator: world.getGenerator() instanceof Flat ? Generator.FLAT : Generator.OVERWORLD`.

`ChangeDimensionPacket` (id 61) is `Dimension ID` (varint), `Position` (Vec3), `Respawn` (bool), optional `Loading Screen Id` (uint32) (Mojang `ChangeDimensionPacketPayload.json`). gophertunnel warns that the target "MUST be a different dimension than the one that the player is currently in", or the loading screen never ends; the client answers with `PlayerAction` `DimensionChangeDone`. This server's layout is in `packages/protocol/src/wire/definitions/worldStatus.ts:63` and the ack is accepted and ignored in `PlayerActionHandler.ts:315`. `Player.setWorld` (`Player.ts:517-566`) sends a fixed Overworld, Nether, Nether, Overworld sequence regardless of the target, so the client always ends in dimension 0.

`DimensionDataPacket` (id 180, "Brief packet containing data-driven dimension properties") is a map of identifier (string, max 256) to `DimensionDefinition` (Mojang `DimensionDataPacketPayload.json`, `DimensionDefinition.json`, 1.26.60-beta.0):

| Ordinal | Field | Wire | Meaning |
|---|---|---|---|
| 0 | `Minimum Y` | varint32 | Lowest y. |
| 1 | `Height Range` | varint32 | Blocks above minimum. |
| 2 | `Generator Type` | varint32 enum | `Legacy` 0, `Overworld` 1, `Flat` 2, `Nether` 3, `TheEnd` 4, `Void` 5, `Undefined` 6. |
| 3 | `Dimension Type` | varint32 | "Dimension runtime ID". gophertunnel: "cannot override a vanilla dimension (0-2), but custom dimensions should start from 1000 like vanilla". |
| 4 | `Pack Id` | UUID | The behavior pack that registered it. |
| 5 | `Default Biome` | string | The biome the dimension generates with. |
| 6 | `Cloud Height` | varint32 | Added at 2225. |
| 7 | `Render Clouds` | bool | Added at 2225. |

gophertunnel notes the packet "does not seem to be sent by default, rather only being sent when any data-driven dimensions are registered" ([dimension_data.go](https://github.com/Sandertv/gophertunnel/blob/master/minecraft/protocol/packet/dimension_data.go), [world.go](https://github.com/Sandertv/gophertunnel/blob/master/minecraft/protocol/world.go)). Dragonfly builds one definition per registered custom dimension with `Generator: GeneratorVoid` and `DimensionType: registration.ID` ([server/server.go, makeDimensionData](https://github.com/df-mc/dragonfly/blob/master/server/server.go)).

In this repository, `packages/protocol/src/packet/DimensionDataPacket.ts` and `structure/DimensionDefinition.ts` implement both directions with the six 2193 fields and no 2225 gate, so a 2225 session would receive a short record. `docs/research/protocol-2225-delta.md:219` still says the class does not exist. Nothing in `packages/prismarine` sends the packet. The wire captures under `packages/bedrock-data/src/jsp/v2193/wire/` and `v2225/wire/` include StartGame (`0x0b.bin`) but not `0xb4` or `0x3d`.

### 2.5 Height agreement

| Dimension | Java 26.3 `dimension_type` | Bedrock client | This repository |
|---|---|---|---|
| Overworld | -64, 384 | -64, 384 | -64, 384 |
| Nether | 0, 256 (logical 128) | 0, 128 | 0, 128 |
| End | 0, 256 | 0, 256 | 0, 256 |

A Java-typed Nether at 256 would make the client crash or discard sub chunks above 128 (Geyser's comment above), so the Bedrock overlay must clamp. Java's `logical_height` of 128 is the number Bedrock uses as the physical height, which is a usable rule: for a vanilla-id dimension, Bedrock height is `min(height, logical_height)` for the Nether and `height` elsewhere. Writing it as explicit overlay data is safer than a rule.

## 3. Prior art

| Project | Dimension model | Generator registration | Config | Custom dimensions | Source |
|---|---|---|---|---|---|
| Dragonfly (Go) | `Dimension` interface: `Range()`, `WaterEvaporates()`, `LavaSpreadDuration()`, `WeatherCycle()`, `TimeCycle()`. Three singletons registered 0, 1, 2. | `world.Config{ Dim, Generator, Provider, PortalDestination }`; `Generator` interface `GenerateChunk(pos, *chunk.Chunk)`, `DefaultSpawn(dim)`. No name registry; the embedding program constructs the generator. | Code, one `World` per dimension, portals via `PortalDestination func(dim) *World`. | `RegisterDimension(id 1000..65535, name, dim)`; range must align to 16; sent as `DimensionData` with `GeneratorVoid`. | [dimension.go](https://github.com/df-mc/dragonfly/blob/master/server/world/dimension.go), [generator.go](https://github.com/df-mc/dragonfly/blob/master/server/world/generator.go), [conf.go](https://github.com/df-mc/dragonfly/blob/master/server/world/conf.go) |
| PowerNukkitX (Java) | `DimensionData(name, id, minHeight, maxHeight, chunkSectionCount)`; `DimensionEnum` OVERWORLD(-64, 319, 24), NETHER(0, 127, 8), THE_END(0, 255, 16). | `GeneratorRegistry` string to class: `flat`, `normal`, `nether`, `the_end`, `void`. | `LevelConfig { format, enable, generators: Map<Integer dimensionId, GeneratorConfig { name, seed, dimensionData, preset: Map }> }`; one level, several dimensions. | None. | [DimensionData.java](https://github.com/PowerNukkitX/PowerNukkitX/blob/beta/src/main/java/org/powernukkitx/level/DimensionData.java), [LevelConfig.java](https://github.com/PowerNukkitX/PowerNukkitX/blob/beta/src/main/java/org/powernukkitx/level/format/LevelConfig.java), [GeneratorRegistry.java](https://github.com/PowerNukkitX/PowerNukkitX/blob/beta/src/main/java/org/powernukkitx/registry/GeneratorRegistry.java) |
| Cloudburst (Java) | `LevelDimension` enum OVERWORLD, NETHER, THE_END; one level per dimension. | `GeneratorRegistry.register(Identifier, GeneratorFactory, fallbackWeight)`; `GeneratorFactory.create(long seed, String options)`; built-ins `cloudburst:standard`, flat, void. | `levels: { world: { dimension: overworld, seed, generator: cloudburst:standard, options: overworld }, nether: { dimension: nether, ... } }`. | None. | [GeneratorRegistry.java](https://github.com/CloudburstMC/Server/blob/develop/server/src/main/java/org/cloudburstmc/server/registry/GeneratorRegistry.java), [cloudburst.yml](https://github.com/CloudburstMC/Server/blob/develop/server/src/test/resources/config/cloudburst.yml) |
| Allay (Java) | `DimensionType` interface: `getId()`, `getIdentifier()`, `getMinHeight()`, `getMaxHeight()`, `hasSkyLight()`, `bedWorks()`, `respawnAnchorWorks()`, `waterEvaporates()`. `DimensionId` enum with default bounds; `world-settings.yml` `built-in-dimensions` can change heights. | Name to `Function<String preset, WorldGenerator>`; `WorldGenerator` is ordered `Noiser`, `Populator`, `PostProcessor` lists plus a preset string; `WorldGeneratorInitEvent` lets plugins append. | `worlds.<name>.dimensions.<identifier>: { generator-type, generator-preset, enable-light-calculation }`; Overworld required. | Dimension types are a registry; custom bounds validated to 16-block sections. | [DimensionType.java](https://github.com/AllayMC/Allay/blob/master/api/src/main/java/org/allaymc/api/world/dimension/DimensionType.java), [WorldGenerator.java](https://github.com/AllayMC/Allay/blob/master/api/src/main/java/org/allaymc/api/world/generator/WorldGenerator.java), [AllayWorldPool.java](https://github.com/AllayMC/Allay/blob/master/server/src/main/java/org/allaymc/server/world/AllayWorldPool.java) |
| Pumpkin (Rust, Java server) | `pumpkin-codegen/src/dimension.rs` reads every `assets/datapack/data/minecraft/dimension_type/*.json` at build time into a `Dimension` struct with `has_skylight`, `coordinate_scale`, `min_y`, `height`, `logical_height`, `monster_spawn_light_level`, attributes flattened to `water_evaporates`, `fast_lava`, `bed_rule`, `cloud_height` and so on. | `Level::from_root_folder(config, dir, seed, dimension)` reads `world_gen_settings.dat`, finds the stem for `dimension.minecraft_name`, and picks flat or noise from `generator.type`, resolving `settings` references including `FlatLevelGeneratorPreset::from_name`. | Server config lists dimensions; each becomes a `Level` folder `dimensions/<namespace>/<name>`. | Any `dimension_type` in the generated set. | [codegen dimension.rs](https://github.com/Pumpkin-MC/Pumpkin/blob/master/tools/pumpkin-codegen/src/dimension.rs), [level.rs](https://github.com/Pumpkin-MC/Pumpkin/blob/master/crates/pumpkin-world/src/level.rs) |
| Geyser (Java to Bedrock proxy) | `JavaDimension.read(registry entry)` keeps `min_y`, `height`, `piglin_safe`, `ultrawarm`, `skybox`, `default_clock`; maps a custom type to a Bedrock id by `skybox` (`none` to Nether, `end` to End, else Overworld) and requires both bounds to be multiples of 16. | Not applicable. | Not applicable. | Any Java custom dimension is squeezed into one of the three Bedrock ids; the Nether can be presented as the End to allow building above 128. | [JavaDimension.java](https://github.com/GeyserMC/Geyser/blob/master/core/src/main/java/org/geysermc/geyser/level/JavaDimension.java) |

Takeaways. Every Bedrock server keeps one small integer id per dimension and one `World` or `Level` object per dimension. The three Java-style servers (PowerNukkitX, Cloudburst, Allay) configure a dimension as a generator name plus an opaque preset string, which keeps generator settings out of the type system. Pumpkin is the only one that treats Java's `dimension_type` and stems as the model, and it is the only one that can load a custom Java dimension without code. Geyser is the reference for which Java type fields a Bedrock client can honor (height bounds, which of the three skyboxes, lava speed, piglin shaking) and which it cannot (anything above the Nether's 128).

## 4. Design

### 4.1 What has to change

From the repository survey (section 1.5, section 2):

1. `WorldData` in config has `seed`, `provider`, `generator`, `layers` and nothing about dimensions. `WorldManager.buildWorld` never passes `dimension`, so every world is the Overworld (`World.ts:507`). Loading a second world needs `/debug loadWorld`.
2. `GeneratorManager` instantiates every export of `Generators.ts` once with `(contentSource, logger)`; a generator cannot be configured per dimension or per stem. The default when `generator` is absent is `'Flat'` in `WorldManager` and `'Overworld'` in `Config.ts`.
3. `DataDrivenGenerator` cannot take an End or fixed biome source; `Flat` ignores the world's dimension (`new Chunk(cx, cz)`).
4. The LevelDB provider is built per `World` from a folder path, so two dimensions cannot share one `db/` as Bedrock does.
5. `Player.setWorld` does not send the target dimension; `DimensionData` is never sent; `DimensionDefinition` lacks the two 2225 fields.
6. `contentAdapter.ts:89-105` hard-codes `DIMENSION_DEFINITIONS`, `SEA_LEVELS` and `hasSkyLight`.
7. `@jsprismarine/packs` does not load worldgen or dimension type files, so a datapack cannot contribute a dimension.
8. No plugin API exists (commit `a528e9d96d` removed it); `registerClassGenerator` and `Server.setContent` are the extension points.

### 4.2 Alternatives

Alternative A, per-world generator string with a dimension field. Add `dimension?: 'overworld' | 'nether' | 'the_end'` to `WorldData`, add `Nether` and `TheEnd` generator classes that pass the right `noiseSettings` and `biomeParameters`, and let `WorldManager` load every `worlds.*` entry. Three config entries make a three-dimension server. This is what Cloudburst does. It is small: no new types, no parsing. It fails the stated goal in four places. Each dimension is a separate folder with its own `level.dat`, so a vanilla Bedrock world cannot be imported or exported as one save. Generator settings stay hidden in class names, so `large_biomes`, `amplified`, a custom noise setting or a flat preset each need a new class. Datapack dimensions remain impossible. A plugin generator still cannot receive settings.

Alternative B, the Java preset model. A `DimensionType` registry from `dimension_type` JSON with a Bedrock overlay, a `LevelStem` per dimension taken from a world preset and overridable in config, a `GeneratorFactories` registry keyed by generator kind id that builds a `Generator` from a stem plus seed plus content, and a `Level` owning one seed, one LevelDB directory and one `World` per stem. This is what Java does and what Pumpkin reads. It is more work: parsing four more registries, routing them through packs, a provider refactor, and a config translation. In return, every vanilla preset works from data, `flat_all_dimensions` and `single_biome_surface` come for free, a datapack can add `dimension_type` and `dimension` files, a plugin adds a generator kind by registering a factory and then names it in a stem, and the on-disk layout matches Bedrock's.

Alternative C, Bedrock's add-on model. Read `<BP>/dimension/*.json` components as the definition of a custom dimension. It covers heights, a default biome and a void generator, and nothing about terrain. It cannot describe the vanilla dimensions because Bedrock does not let packs redefine them (26.50.25). As the primary model it is too thin; as an input format layered on B it is cheap: a pack dimension becomes a stem `{ type: <synthesized type from dimension_height>, generator: { type: 'jsprismarine:void' } }` with `defaultBiome` carried into the `DimensionData` definition.

Recommendation: B, with C accepted later as an input format. A is the right shape only if the project were to stop at three vanilla dimensions, and the data-driven plan (`docs/plans/data-driven-vanilla.md`) says the terrain stack comes from Java's published JSON, which already contains the stems.

### 4.3 Proposed types

Parsing types, in `@jsprismarine/worldgen` under `src/dimension/`:

```ts
/** data/<ns>/dimension_type/<name>.json, 26.3 shape. */
export interface DimensionTypeDefinition {
    readonly minY: number;
    readonly height: number;
    readonly logicalHeight: number;
    readonly coordinateScale: number;
    readonly hasSkylight: boolean;
    readonly hasCeiling: boolean;
    readonly hasFixedTime: boolean;
    readonly hasEnderDragonFight: boolean;
    readonly ambientLight: number;
    readonly monsterSpawnLightLevel: IntProvider;
    readonly monsterSpawnBlockLightLimit: number;
    readonly infiniburn: string;
    readonly skybox: 'overworld' | 'none' | 'end';
    readonly cardinalLight: 'default' | 'nether';
    readonly defaultClock?: string;
    readonly timelines: readonly string[];
    /** Environment attributes, keyed by attribute id. Values stay as parsed JSON. */
    readonly attributes: ReadonlyMap<string, unknown>;
}

export type BiomeSourceDefinition =
    | { readonly type: 'minecraft:multi_noise'; readonly preset: string }
    | { readonly type: 'minecraft:multi_noise'; readonly biomes: readonly ClimateParameterPoint[] }
    | { readonly type: 'minecraft:fixed'; readonly biome: string }
    | { readonly type: 'minecraft:checkerboard'; readonly biomes: readonly string[]; readonly scale: number }
    | { readonly type: 'minecraft:the_end' };

export interface FlatGeneratorSettings {
    readonly layers: readonly { readonly block: string; readonly height: number }[];
    readonly biome: string;
    readonly lakes: boolean;
    readonly features: boolean;
    readonly structureOverrides?: readonly string[] | string;
}

/** The `generator` object of a level stem. Unknown kinds keep their JSON for a factory to read. */
export type GeneratorDefinition =
    | { readonly type: 'minecraft:noise'; readonly settings: string | NoiseGeneratorSettings; readonly biomeSource: BiomeSourceDefinition }
    | { readonly type: 'minecraft:flat'; readonly settings: FlatGeneratorSettings }
    | { readonly type: 'minecraft:debug' }
    | { readonly type: string; readonly settings: unknown };

export interface LevelStem {
    readonly type: string; // dimension_type id
    readonly generator: GeneratorDefinition;
}

export interface WorldPreset {
    readonly dimensions: ReadonlyMap<string, LevelStem>; // must contain minecraft:overworld
}

export const parseDimensionType: (json: unknown, path: string) => DimensionTypeDefinition;
export const parseLevelStem: (json: unknown, path: string) => LevelStem;
export const parseWorldPreset: (json: unknown, path: string) => WorldPreset;
export const parseBiomeSource: (definition: BiomeSourceDefinition, parameterLists: ReadonlyMap<string, ClimateParameterPoint[]>) => BiomeSource;
```

`parseBiomeSource` is the missing dispatch over the four existing classes. `preset` resolves through the biome parameter reports already loaded by `javaWorldgenData.ts`, keyed by the `multi_noise_biome_source_parameter_list` id.

Edition overlay, in `@jsprismarine/mapping`:

```ts
export interface BedrockDimensionOverlay {
    /** The integer that goes into chunk keys and packets. 0 to 2 for vanilla, 1000 and up otherwise. */
    readonly dimensionId: number;
    /** The Bedrock name, `minecraft:nether` for Java's `minecraft:the_nether`. */
    readonly bedrockName: string;
    /** Height the client accepts for this id; overrides the Java type when present. */
    readonly minY?: number;
    readonly height?: number;
    /** `Generator Type` for StartGame and DimensionData. */
    readonly generatorType: Generator; // @jsprismarine/minecraft enum
}
export const bedrockDimensionOverlay: (dimensionTypeId: string) => BedrockDimensionOverlay | undefined;
```

The data file is `packages/mapping/src/data/dimensions.json` with three rows: `minecraft:overworld` to `{0, 'minecraft:overworld', generatorType 1}`, `minecraft:the_nether` to `{1, 'minecraft:nether', minY 0, height 128, generatorType 3}`, `minecraft:the_end` to `{2, 'minecraft:the_end', generatorType 4}`. A type with no row is custom: the runtime allocates an id from 1000 upward in stem order, uses the Java bounds clamped to Bedrock's -512 to 512 and 1024 maximum, and sends `Generator Type` `Void` as Dragonfly does.

Runtime types, in `@jsprismarine/prismarine` under `src/world/`:

```ts
/** A dimension type with its Bedrock view resolved. Replaces today's DimensionDefinition. */
export interface DimensionType {
    readonly id: string;                 // Java id, minecraft:the_nether
    readonly bedrockId: number;          // 0, 1, 2, or 1000+
    readonly bedrockName: string;        // what LevelDB village keys and legacy code expect
    readonly minY: number;               // Bedrock-effective
    readonly height: number;             // Bedrock-effective
    readonly java: DimensionTypeDefinition;
    readonly custom: boolean;            // true when a DimensionData entry must be sent
}

export interface GeneratorBuildContext {
    readonly stem: LevelStem;
    readonly dimension: DimensionType;
    readonly seed: bigint;
    readonly content: () => ServerContent;
    readonly worldgen: JavaWorldgenRegistries;
    readonly logger: GeneratorLogger;
    readonly workers: GenerationWorkerBudget; // share of the host's worker count
}

export interface GeneratorFactory {
    readonly kind: string; // minecraft:noise, minecraft:flat, minecraft:debug, jsprismarine:void, plugin ids
    build(context: GeneratorBuildContext): Generator;
}

export class GeneratorFactories {
    register(factory: GeneratorFactory): void;   // throws on a duplicate kind
    build(context: GeneratorBuildContext): Generator; // throws naming the unknown kind and the known ones
}

/** One `worlds.<name>` entry: a folder, a seed, a dimension set. */
export class Level {
    readonly name: string;
    readonly seed: bigint;
    readonly provider: LevelProvider;             // one LevelDB handle for all dimensions
    readonly stems: ReadonlyMap<string, LevelStem>;
    world(dimensionTypeId: string): World;        // builds lazily, generator from the factory
    worlds(): Iterable<World>;
    customDimensionDefinitions(): DimensionDefinition[]; // for DimensionDataPacket
}
```

`World` keeps its current role, one dimension's chunks, ticking and players, and gains a `DimensionType` in place of `DimensionDefinition`. `Generator` keeps its signature, which ADR 0002 already requires. `GeneratorManager` becomes `GeneratorFactories`; the built-in factories are `minecraft:noise` (wraps `DataDrivenGenerator`, passes `dimension`, `noiseSettings`, and a `BiomeSource` from `parseBiomeSource`), `minecraft:flat` (today's `Flat`, rewritten to read `FlatGeneratorSettings`, honor `biome`, start at the dimension's `minY`, and apply `structure_overrides` when structures reach flat worlds), `minecraft:debug` (optional, low value for a Bedrock server; register it so the preset parses and have it throw a clear "not supported" at build time until implemented) and `jsprismarine:void`.

Provider. `LevelProvider` opens one `db/` and exposes `readChunk(dimension, x, z, ...)`, `writeChunk(dimension, chunk)`, `listChunks(dimension)`; the `World` passes its `DimensionType.bedrockId`. This is a signature change to `LevelDB.ts` and `Anvil` where today `this.getWorld().getDimension()` is read; `LevelDBKeys.ts` needs no change. `level.dat` gains `Generator` (2 when the Overworld stem is flat, else 1), `FlatWorldLayers` built from the flat settings when the Overworld stem is flat, and `NetherScale` from the Nether type's `coordinate_scale`. The resolved stems are persisted alongside, as JSON in the existing `jsprismarine:world_data` key, in the `world_gen_settings` shape (`{ seed, dimensions: { id: stem } }`) so that a world keeps its generators when the config changes; on a mismatch the saved stems win and the server logs the difference.

### 4.4 Package ownership

| Concern | Package | Why |
|---|---|---|
| Parsing `dimension_type`, stems, presets, flat settings, biome source dispatch | `@jsprismarine/worldgen` | It already owns noise settings, density functions, surface rules and the four biome source classes, and has no runtime dependencies. |
| Routing `data/*/dimension_type/**`, `data/*/dimension/**`, `data/*/worldgen/{world_preset, flat_level_generator_preset, multi_noise_biome_source_parameter_list, noise_settings, density_function, noise, ...}` into Java registries | `@jsprismarine/packs` | Its README lists the registries it routes; the content README names worldgen as the gap. Doing this also retires `javaWorldgenData.ts`'s private directory walker in favor of the pack stack, which is what lets a user datapack add a dimension. |
| Java id to Bedrock id, name and height overlay | `@jsprismarine/mapping` | The plan gives it the edition boundary; `packRegistries.ts` already knows `world_preset` exists. |
| `DimensionType`, `Level`, `GeneratorFactories`, built-in factories, config translation, `DimensionData` and `ChangeDimension` sending | `@jsprismarine/prismarine` | Generators produce `Chunk`s and factories need `ServerContent`; both are prismarine types. |
| `DimensionDefinition` cloud fields at 2225 | `@jsprismarine/protocol` | Wire layout. |
| A test family for dimension and preset data | `@jsprismarine/parity` | AGENTS.md requires it for data-driven compatibility behavior. |

A new `packages/dimensions` is not recommended. The parsing half fits worldgen (same inputs, same style), the runtime half needs prismarine's `Chunk` and `ServerContent`, and the edition overlay is three rows that belong with the rest of mapping. A separate package would hold types only and add a boundary every other package crosses.

### 4.5 Data files

- Inputs already in the cache: `data/minecraft/dimension_type/*.json` (4), `worldgen/world_preset/*.json` (7), `worldgen/flat_level_generator_preset/*.json` (9), `worldgen/multi_noise_biome_source_parameter_list/*.json` (2), `tags/worldgen/world_preset/*.json` (2), `reports/biome_parameters/minecraft/*.json` (2). All reach the server through the vanilla datapack source in `packStack.ts` once packs route them.
- New: `packages/mapping/src/data/dimensions.json` (the three-row overlay, section 4.3). Generated outputs under `packages/bedrock-data/src/generated/` are not involved.
- New: a parity fixture that loads the seven presets and four types through the public parser and asserts the heights, scale and the stem kinds per dimension against the table in section 1.2.

### 4.6 Config shape

```jsonc
{
  "worlds": {
    "world": {
      "seed": "8475011743740320021",
      "provider": "LevelDB",
      "preset": "minecraft:normal",
      "dimensions": {
        "minecraft:the_end": { "load": "lazy" },
        "minecraft:overworld": {
          "type": "minecraft:overworld",
          "generator": { "type": "minecraft:flat", "settings": { "biome": "minecraft:plains", "layers": [{ "block": "minecraft:bedrock", "height": 1 }, { "block": "minecraft:grass_block", "height": 3 }] } }
        }
      }
    }
  }
}
```

Rules, matching Java's: `preset` defaults to `minecraft:normal` and supplies the stems. Each `dimensions.<id>` entry overrides the preset's stem for that id when it carries `type` or `generator` (both optional; a missing one comes from the preset), or adds a new dimension when the id is not in the preset. `load` is `eager` or `lazy` (default `lazy`: the `World` and its worker pool are built on first entry, because ADR 0002 budgets about 500 MiB for a six-worker pool and three eager pools would triple it). The `generator.settings` of a flat stem may also be a `flat_level_generator_preset` id string, as Java allows in `world_gen_settings.dat` (Pumpkin's `GeneratorSettings::Reference`). `WorldManager` loads every `worlds.*` entry, not only `level-name`; `level-name` stays the one players join.

JSON schema: `WorldData` gains `preset?: string`, `dimensions?: Record<string, DimensionConfig>` and keeps `generator` and `layers` as deprecated with `@deprecated` JSDoc so `ts-json-schema-generator` marks them.

### 4.7 Migration of `generator: 'Overworld' | 'Flat'`

A pure translation in `Config` (or a `normalizeWorldData` step in `WorldManager`), applied before anything else reads a world entry:

| Old entry | New entry |
|---|---|
| `generator: 'Overworld'` or absent with a `provider` | `preset: 'minecraft:normal'` |
| `generator: 'Flat'`, no `layers` | `preset: 'minecraft:flat'` |
| `generator: 'Flat'`, `layers: [{ block, size }]` | `preset: 'minecraft:flat'`, `dimensions['minecraft:overworld'].generator = { type: 'minecraft:flat', settings: { biome: 'minecraft:plains', layers: layers.map(l => ({ block, height: size })), lakes: false, features: false, structure_overrides: [] } }` |
| any other `generator` string | error naming the registered kinds, same as today's "Invalid generator" |

The translation logs once per world that the keys are deprecated, and `Config` writes the new keys on its next save so the file converges. The default config writer switches to `preset: 'minecraft:normal'`. `docs/running.md` section 5 and section 1.3 change accordingly (Flat still runs without Java data because the flat factory needs no worldgen registries; the noise factory throws the existing "needs Java Edition 26.3 world generation data" message). Existing LevelDB folders need no conversion: Overworld keys have no dimension int, exactly as before, and the persisted stems are written on first load from the translated config.

The `Flat` and `Overworld` exports of `Generators.ts` stay for one release as thin aliases that build through the factories, so `registerClassGenerator` callers in tests keep compiling, then go.

### 4.8 Client behavior

- `StartGame`: `dimension` is the spawn dimension's `bedrockId`; `generator` is the Overworld stem's overlay `generatorType` (2 for flat, else 1), since the field describes the world type, not the spawn dimension.
- `DimensionData`: sent after `StartGame` and before chunks when `Level.customDimensionDefinitions()` is non-empty, one entry per custom type, with `Dimension Type` from 1000 up, `Generator Type` `Void`, `Default Biome` from the stem's fixed biome or `minecraft:plains`, and at 2225 `Cloud Height` from `minecraft:visual/cloud_height` and `Render Clouds` from its presence. Whether a client accepts `ChangeDimension` to an id of 1000 or more has not been verified here; Dragonfly registers such ids and Mojang's payload comment lists only 0 to 3, so the first implementation slice should test it against a real client before relying on it.
- `ChangeDimension`: `Player.setWorld` sends one packet with the target's `bedrockId` when it differs from the current one, and the Overworld, Nether, Nether, Overworld sequence only when the ids are equal (same-dimension world swap, the case gophertunnel warns about). `PlayerActionHandler`'s `ChangeDimensionAck` branch completes the pending change instead of returning.
- Portals use `coordinate_scale` from the two types (8:1 for the Nether) and `logical_height` for the destination search ceiling. That is a later slice; the types carry the numbers from day one.
- `contentAdapter.ts` reads `hasSkylight`, sea level (from the stem's resolved noise settings `sea_level`, which `NoiseGeneratorSettings` already exposes) and the dimension table from the `Level` instead of its constants.

### 4.9 Implementation chunks

Each is a reviewable slice with its own tests. Order matters within the first five.

1. `@jsprismarine/worldgen`: `parseDimensionType`, `parseLevelStem`, `parseWorldPreset`, `FlatGeneratorSettings`, `parseBiomeSource` with `preset` resolution; unit tests over the eleven cache files; README section.
2. `@jsprismarine/packs`: route `dimension_type`, `dimension`, `worldgen/world_preset`, `worldgen/flat_level_generator_preset`, `worldgen/multi_noise_biome_source_parameter_list` and the terrain registries `javaWorldgenData.ts` reads today; flip the two assertions in `javaRegistries.test.ts`; make `javaWorldgenData.ts` read from `Definitions` instead of walking the cache.
3. `@jsprismarine/mapping`: `dimensions.json` overlay and `bedrockDimensionOverlay`; test that the three rows match section 2.5.
4. `@jsprismarine/prismarine` types: `DimensionType` replacing `DimensionDefinition` (keep the old name as a deprecated alias for one release), `GeneratorFactories` with the `minecraft:flat` and `jsprismarine:void` factories, `minecraft:noise` factory over `DataDrivenGenerator` with a `BiomeSource` parameter replacing the `MultiNoiseBiomeSource` field; End generation test through `TheEndBiomeSource`.
5. `Level` and the provider refactor: one LevelDB handle per level, dimension passed to provider methods, `level.dat` `Generator`, `FlatWorldLayers`, `NetherScale`, persisted stems; `WorldManager` loads all `worlds.*` entries; config translation from section 4.7 with tests for each row of the table; schema regeneration; `docs/running.md`.
6. Client: `ChangeDimension` to the real target, ack handling, `DimensionData` for custom types, `StartGame` fields from the level; `DimensionDefinition` 2225 cloud fields in `@jsprismarine/protocol` with round-trip coverage; update `docs/research/protocol-2225-delta.md:122` and `:219`.
7. `contentAdapter.ts` constants replaced by `Level` lookups; `command/host/support.ts` name bridge replaced by `DimensionType.bedrockName`.
8. `@jsprismarine/parity`: a `dimensions` family loading the presets and types through the public parsers and asserting the section 1.2 and 2.5 tables.
9. Later: portals and `coordinate_scale` travel; end city and nether fortress structure builders; Bedrock `dimension/*.json` as a stem input (alternative C); `minecraft:debug`.

## Reproduction

```sh
# Java data (pinned 26.3; the cache is populated by `pnpm dev` or ensure:worldgen)
D=node_modules/.cache/jsprismarine/vanilla-datapack/26.3/data/minecraft
ls $D/dimension_type $D/worldgen/world_preset $D/worldgen/flat_level_generator_preset $D/worldgen/multi_noise_biome_source_parameter_list
cat $D/dimension_type/the_nether.json $D/worldgen/world_preset/normal.json $D/tags/worldgen/world_preset/normal.json
ls node_modules/.cache/jsprismarine/java-reports/26.3/generated/reports/biome_parameters/minecraft/

# Wiki pages (raw wikitext)
curl -sL 'https://minecraft.wiki/w/Dimension_type?action=raw'
curl -sL 'https://minecraft.wiki/w/Dimension_definition?action=raw'
curl -sL 'https://minecraft.wiki/w/World_preset_definition?action=raw'
curl -sL 'https://minecraft.wiki/w/Superflat/Settings?action=raw'
curl -sL 'https://minecraft.wiki/w/Bedrock_Edition_level_format?action=raw'

# Mojang protocol schemas (1.26.60-beta.0, protocol 2225)
for n in DimensionDataPacket DimensionDataPacketPayload DimensionDefinition DimensionType ChangeDimensionPacketPayload; do
  curl -sL "https://raw.githubusercontent.com/Mojang/bedrock-protocol-docs/main/json/$n.json"; done

# gophertunnel
curl -sL https://raw.githubusercontent.com/Sandertv/gophertunnel/master/minecraft/protocol/world.go
curl -sL https://raw.githubusercontent.com/Sandertv/gophertunnel/master/minecraft/protocol/packet/dimension_data.go
curl -sL https://raw.githubusercontent.com/Sandertv/gophertunnel/master/minecraft/protocol/packet/change_dimension.go
curl -sL https://raw.githubusercontent.com/Sandertv/gophertunnel/master/minecraft/protocol/packet/start_game.go

# Script API
curl -sL 'https://learn.microsoft.com/en-us/minecraft/creator/scriptapi/minecraft/server/dimensionregistry?view=minecraft-bedrock-stable'

# Repository
grep -rn 'DIMENSION_DEFINITIONS\|SEA_LEVELS' packages/prismarine/src/world/contentAdapter.ts
grep -n 'dimension_type\|worldgen' packages/packs/src/javaRegistries.test.ts
grep -n 'biomeSource' packages/prismarine/src/world/generators/datadriven/DataDrivenGenerator.ts | head
sed -n 517,566p packages/prismarine/src/Player.ts
```
