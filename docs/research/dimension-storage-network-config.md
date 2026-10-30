# What multi-dimension worlds need from storage, the chunk pipeline, the network layer and the config

Researched 2026-10-30 against this repository at `33da30f855`, the Bedrock level format and Java level format pages on minecraft.wiki (raw wikitext fetched the same day), Microsoft Learn's "Actor Storage" document, and Mojang's bedrock-protocol-docs for 1.26.51 (protocol 2193). Every claim names its source. The commands that reproduce the repository measurements are in [Reproduction](#reproduction).

The question is what changes when one save folder holds an Overworld, a Nether and an End instead of one dimension per `World`. The answer is in five parts: how both on-disk formats address a dimension, how the generator pool would carry three generators, which packets name a dimension and which of those the server fills in, what the config and the runtime object model look like, and how to test it.

## Summary

1. The LevelDB key layer already carries a dimension. `encodeChunkKey`, `decodeChunkKey` and `encodeDigestKey` in `packages/prismarine/src/world/providers/leveldb/LevelDBKeys.ts` write the optional 4 byte dimension id exactly as the wiki and Microsoft document it, and `DiskFormat.test.ts` covers ids 1 and 2. Everything above that layer pins the dimension to the `World`: `LevelDB.dimension()` returns `this.getWorld().getDimension()`, and `readChunk`, `writeChunk`, `listChunks`, `readBiomes` and the pending-entity keys all read it from there. The provider API has no dimension parameter.
2. The `level.dat` the provider writes holds `LevelName`, `RandomSeed`, `StorageVersion`, `lastOpenedWithVersion`, `SpawnX/Y/Z` and a project tag `JSPrismarineSpawnKnown` (`LevelDB.buildLevelDat`). It writes none of `Generator`, `FlatWorldLayers`, `NetherScale` or `Time`, which the wiki lists as the fields the game reads for world type, flat layers, portal scale and the clock. Player records carry the spawn dimension as a string under the project's `JSPrismarine` compound (`PlayerCodec.ts` line 240), not as Bedrock's `SpawnDimension` int, and they never write `DimensionId`, the field Bedrock uses for where the player is. Entity NBT from `EntitySerializer.toNBT` writes no `DimensionId` either; the chunk the actor digest hangs off is what places it.
3. The Anvil provider is a stub: `readChunk` regenerates and `writeChunk` is `// TODO.` (`providers/anvil/Anvil.ts` lines 41 to 55). Java stores each dimension under its own directory, `dimensions/minecraft/the_nether` and `dimensions/minecraft/the_end` since 26.1 and `DIM-1` and `DIM1` before that, with `world_gen_settings.dat` naming the generator per dimension. An Anvil implementation would get a dimension directory for free; the LevelDB one has to thread the id.
4. The recommended provider API is one provider per save folder with a dimension on every chunk call: `readChunk(dimension, cx, cz, ...)`, `writeChunk(chunk)` reading `chunk.getDimension()`, `listChunks(dimension)`, plus world-level `readWorldData` and player calls that stay per save. One LevelDB database per save is what the game writes, so one provider per dimension would mean three handles on one `db/` directory, which `LevelDB.enable` already refuses ("refuses a second provider on the same folder", `LevelDB.test.ts` line 577).
5. Generator instances are shared by every world that names them (`GeneratorManager` constructor comment), and a `DataDrivenGenerator` "covers one dimension" (`DataDrivenGenerator.ts` line 530): its `dimension`, `noiseSettings` and `biomeParameters` are constructor options and travel to the workers once, in `workerData`, as `ChunkPipelineSetup`. The seed travels per task as a decimal string. Three dimensions therefore mean three `DataDrivenGenerator` instances and three `GenerationPool`s of `min(6, cores - 2)` workers each unless the settings move from the pool setup into the task input. The worker already caches a pipeline per seed; making the cache key `(noiseSettings, biomeParameters, seed)` lets one pool serve every dimension.
6. The nether's terrain inputs exist in `packages/worldgen`: `MultiNoiseBiomeSource` is tested against the nether parameter list, `RandomState` takes the pre-1.18 path for `minecraft:nether/temperature` and `minecraft:nether/vegetation`, aquifers are optional in `NoiseGeneratorSettings`, the surface test runs the `minecraft:nether` preset and the carver test runs `minecraft:nether_cave`. The End's inputs exist too: `TheEndBiomeSource` and the `end_outer_islands` density type are parsed, compiled and tested. What is missing is the selection: `DataDrivenGenerator` always builds `MultiNoiseBiomeSource.fromJson(...)` (line 612), so nothing can pick `TheEndBiomeSource`, and `Overworld.ts` never passes `noiseSettings` or `dimension`. Of Java's 16 structure types, 14 have builders; the end city and the nether fortress do not (`javaStructureTypes.ts` line 6). The bastion goes through the jigsaw builder.
7. Fourteen packets in `packages/protocol` carry a dimension id. The server fills in `StartGame`, `LevelChunk`, `SetSpawnPosition`, `SpawnParticleEffect` and `ChangeDimension`, each from `world.getDimension().id`. `DimensionDataPacket` is implemented and never sent. `SubChunkRequest` is decoded, logged and refused. `ClientboundMapItemData`, `AddVolumeEntity`, `RemoveVolumeEntity`, `ClientboundAttributeLayerSync`, `LegacyTelemetryEvent` and `ServerboundDiagnostics` are codecs with no caller. `Respawn`, `MoveActorAbsolute`, `MovePlayer` and `NetworkChunkPublisherUpdate` carry no dimension at all; the client applies them to whatever dimension it is in.
8. `Player.setWorld` moves a player between worlds by sending `ChangeDimension` to the Nether and back to the Overworld twice, with `PlayStatus` between each, to force the client to drop its terrain (`Player.ts` lines 522 to 560). With real dimensions the first `ChangeDimension` names the destination dimension and the dance goes away, except for a move between two worlds of the same dimension, where it stays.
9. The config has no dimension field. `WorldData` in `config/JsonConfigTypes.ts` is `{ seed, provider?, generator?, layers? }`, `WorldManager.buildWorld` never sets `World`'s `dimension` option, and `WorldManager.enable` loads only the `level-name` world. `Server.ts` and the content packages address a world by dimension name through `getWorldByDimension`, with the comment "this server loads one world per dimension" (`Server.ts` line 295). The recommended shape keeps `generator: "Overworld"` and `"Flat"` as they are and adds an optional `dimensions` map; a config without it reads as today.
10. The `World` class has 84 public methods. By regex over non-test source, the per-dimension ones dominate: `setBlock` 32 calls, `getBlock` 29, `getLoadedChunk` 26, `getEntities` 20, `getEntity` 20, `getPlayers` 28, against `getTicks` 12, `getGameRuleManager` 14, `getGameRule` 11 and `weatherCycle` 6 for the per-world ones. `getWorld()` appears 102 times across 38 files. Introducing a `Dimension` runtime object touches every one of those sites unless `World` keeps the per-dimension methods as forwarders, which is the recommended first step.

## 1. Storage

### 1.1 Bedrock LevelDB, as the sources describe it

The chunk key is two signed 32 bit little-endian integers for chunk x and z, "an optional third 32-bit little-endian integer (1 for the Nether, 2 for the End, omitted for the Overworld)", a one byte record tag, and for `SubChunkPrefix` a signed one byte sub chunk index. Keys are therefore 9, 10, 13 or 14 bytes, and the wiki adds a 21 byte `JigsawStructureBlueprint` form where the dimension integer is always present and an 8 byte structure id follows. "Negative indices represent terrain below Y=0; readers must not assume every dimension has only 16 subchunks." (minecraft.wiki, Bedrock Edition level format, "Chunk key format".)

Microsoft's Actor Storage document gives the same shape from the other side: chunk keys "take the legacy chunk key form of `<Chunk Position><DimensionID>`", with the note that "there is a very old legacy chunk format in which there is no dimension ID", and that such chunks "will be saved out under a new key with the dimension ID". Its `LevelChunkTag` enum starts at `Data3D = 43` and runs `Version`, `Data2D`, `Data2DLegacy`, `SubChunkPrefix`, `LegacyTerrain`, `BlockEntity`, `Entity`, `PendingTicks`, `LegacyBlockExtraData`, `BiomeState`, `FinalizedState`, `ConversionData`, `BorderBlocks`, `HardcodedSpawners`, `RandomTicks`, `CheckSums`, `GenerationSeed`, `GeneratedPreCavesAndCliffsBlending = 61`, `BlendingBiomeHeight = 62`, `MetaDataHash`, `BlendingData`, `ActorDigestVersion`, `LegacyVersion = 118`. The repository's `ChunkTag` enum in `LevelDBKeys.ts` now matches that ordering, including `GenerationSeed = 0x3c` and `MetaDataHash = 0x3f`; the error the 2026-10-24 storage note reported has been fixed.

Actors are not in the chunk record. Each digest key is `digp<Chunk Key>` where "`<Chunk Key>` is the same key string used by the chunk the data is associated with", so a Nether chunk's digest is `digp` plus the 12 byte key with the dimension. Each actor is `actorprefix<ActorUniqueID>`, and the id "is consistent between play sessions and is only unique to this world" (Microsoft Learn, Actor Storage). The wiki's player NBT lists `DimensionId` ("The ID of the dimension the player is in") and `SpawnDimension` beside `SpawnX/Y/Z`, and the general entity NBT lists an optional `LastDimensionId` (minecraft.wiki, Bedrock Edition level format/Entity format, lines 39, 675 and 712 of the wikitext).

Other dimension-relevant keys the wiki lists: `~local_player` and `player_<...>` records (one NBT compound each, with the `Dimension` or `DimensionId` int inside), `game_flatworldlayers` ("[7,3,3,2]" as ASCII), village keys prefixed `VILLAGE_<DIMENSION>_<uuid>_` with `DWELLERS`, `INFO`, `POI` and `PLAYERS` suffixes, and `portals`. The `portals` value is a compound `data` holding a `PortalRecords` list whose entries are `DimId` int, `Span` byte, `TpX`, `TpY`, `TpZ` ints and `Xa`, `Za` bytes (minecraft.wiki, Bedrock Edition level format/Other data format, "Portals"). The village prefix is the one place Bedrock addresses a dimension by name rather than id on disk.

The `level.dat` fields that matter for dimensions, from the same wiki page:

| Field | Type | What the wiki says |
|---|---|---|
| `Generator` | int | "The world type. 0 is Old, 1 is Infinite, 2 is Flat, 5 is Void, and others are Infinite with the bedrock layer at 0." |
| `FlatWorldLayers` | string | JSON with `biome_id`, `block_layers` (`block_name`, `count`), `encoding_version` 6, `preset_id`, `structure_options`, `world_version`. "The `block_layers` array must contain at least 2 valid blocks, otherwise the world will generate as void." |
| `NetherScale` | int | "The horizontal coordinate scale between the Overworld and Nether. The default of 8 means one Nether block corresponds to eight Overworld blocks." |
| `SpawnX`, `SpawnY`, `SpawnZ` | int | The world spawn, defaults 0, 64, 0. No dimension beside it: the world spawn is always in the Overworld. |
| `RandomSeed` | long | One seed for the whole save. |
| `Time` | long | The clock, "always increasing and can be larger than 24000". One clock per save, shared by every dimension. |
| `StorageVersion` | int | "currently is 10". |
| `LimitedWorldOriginX/Y/Z` | int | Where an Old world's 256 by 256 generation started. |

Two things follow for the object model. The seed, the clock and the spawn are per save, which matches the proposed `World`. The `Generator` int is per save too, because Bedrock's nether and end have exactly one generator each; a per-dimension generator choice is a server-side concept with no `level.dat` field to hold it, so it has to live in the config or in a project-owned record.

### 1.2 Java Anvil, as the sources describe it

Before 26.1 the Nether was `DIM-1/region/r.<x>.<z>.mca` and the End `DIM1/region/...` beside the Overworld's top-level `region/`. 26.1 moved every dimension under `dimensions/<namespace>/<path>/`, so the vanilla three are `dimensions/minecraft/overworld`, `dimensions/minecraft/the_nether` and `dimensions/minecraft/the_end`, each with `region/`, `entities/` and `poi/`, and "the top level `data` folder is now only for data shared across dimensions". The same release moved `WorldGenSettings` out of `level.dat` into `data/minecraft/world_gen_settings.dat`, and the dragon fight into `dimensions/minecraft/the_end/data/minecraft/ender_dragon_fight.dat` (minecraft.wiki, Java Edition level format, directory tree and history table rows for 26.1). A custom dimension is `dimensions/<namespace>/<path>/` with the same layout.

A Java dimension definition is `{ type, generator }`, where `type` is a dimension type (`overworld`, `the_nether`, `the_end`, `overworld_caves` or custom) and `generator.type` is `noise`, `flat` or `debug`. A `noise` generator names its `settings` (a noise settings id such as `minecraft:nether` or `minecraft:end`) and a `biome_source` of type `multi_noise` (with `preset` `overworld` or `nether`, or an inline list), `the_end`, `fixed` or `checkerboard`. Since 22w11a "the world seed is now always used for all dimensions" (minecraft.wiki, Dimension definition). The Java `level.dat` spawn is a compound `spawn` with a `dimension` string, `pos`, `pitch` and `yaw`, so unlike Bedrock, Java can put the world spawn outside the Overworld.

The repository's Java-shaped data already has these documents: `javaWorldgenData.ts` reads every `worldgen/noise_settings` file (line 180) and keys `reports/biome_parameters` "by dimension identifier such as `minecraft:overworld`" (line 65). So the nether's and the end's noise settings are on disk once the cache is warm. The dimension and world preset files themselves are not read by anything.

### 1.3 What this repository does today

`Provider` (`providers/Provider.ts`) has `readChunk(cx, cz, seed, generator, config?, options?)`, `writeChunk(chunk)`, `readWorldData`, `writeWorldData`, `migrateLegacyWorldData`, optional `saveLevelData(spawn)`, `readPlayerData(key)` and `writePlayerData(key, data)`. None of them takes a dimension. `BaseProvider` holds one `world` set through `setWorld`, and `LevelDB.dimension()` is `this.getWorld().getDimension()` (line 115).

Inside `LevelDB.ts` the dimension flows from that one accessor into every key: `readChunk` (line 204), `writeChunk` (line 256, from `chunk.getDimension()`), `migrateLegacyEntities` (line 393), `writeEntities` (line 565), `buildLevelDat` (line 712, for the default `SpawnY` of `minY + 100`), `listChunks` (line 743, filtering keys to this dimension), `readBiomes` (line 757), and the project-owned `jsprismarine:pending_entities:` key, which packs x, z and dimension (line 775). The world data record `jsprismarine:world_data` is per database, not per dimension. `readChunk` builds `new Chunk(cx, cz, subChunks, dimension)` and iterates `minSubChunk(dimension)` to `maxSubChunk(dimension)`, so the Nether's 8 and the End's 16 sub chunks would read correctly if the dimension were anything but the Overworld.

`PlayerCodec.ts` writes Bedrock's `SpawnX/Y/Z` and puts `spawnDimension` as a namespaced string and `spawnForced` under the `JSPrismarine` compound (lines 192 to 245). It does not write `DimensionId` or `SpawnDimension`. `WorldPlayerData.position` (`config/JsonConfigTypes.ts` line 232) has `x, y, z, pitch, yaw, headYaw` and no world or dimension. Which world a returning player lands in is decided by `PlayerRecords.lastPlayerRecord`, which reads the record out of every loaded world and takes the newest `savedAt` (comment: "this server loads one world per dimension"). With one `World` holding three dimensions that search collapses to one read plus a `DimensionId`.

`EntitySerializer.toNBT` writes `identifier`, `Pos`, `Rotation`, `Tags`, fuse fields and status effects (`entity/EntitySerializer.ts` line 37 and 86). No `DimensionId`. An actor's dimension is implied by the digest it is listed in, which is what the game does too; adding `DimensionId` is cheap and lets a reader cross-check.

The Anvil provider creates `data`, `entities`, `playerdata` and `region` directories at the top level, which is the pre-26.1 Overworld layout, generates on every read and writes nothing.

### 1.4 Proposed provider API

One provider per save folder. The LevelDB provider opens one `db/`, and the `level.dat`, `player_server_*` records and `portals` key are per save, so a per-dimension provider would have to share the handle. Change the chunk calls to name the dimension and leave the per-save calls alone:

```ts
interface Provider extends Service {
    readChunk(dimension: DimensionDefinition, cx: number, cz: number, seed: bigint,
              generator: Generator, config?: WorldConfig, options?: ChunkRequestOptions): Promise<Chunk>;
    writeChunk(chunk: Chunk): Promise<void>;               // reads chunk.getDimension()
    listChunks?(dimension: DimensionDefinition): IterableIterator<{ x: number; z: number }>;
    readWorldData(): Promise<WorldPersistenceData | null>;  // per save, unchanged
    writeWorldData(data: WorldPersistenceData): Promise<void>;
    readPlayerData?(key: string): Promise<Partial<WorldPlayerData> | null>;
    writePlayerData?(key: string, data: WorldPlayerData): Promise<void>;
}
```

Inside `LevelDB.ts` this is a mechanical change: replace `this.dimension()` with the parameter in `readChunk`, `readBiomes`, `listChunks` and the pending-entity helpers; `writeChunk` and `writeEntities` already read `chunk.getDimension()`. `BaseProvider.world` stays for the logger and the entity list, but `writeEntities` should take the entities of the chunk's dimension rather than `this.getWorld().getEntities()`, which is where a per-dimension entity set has to reach the provider.

Records that gain a dimension: `WorldPlayerData` gets `dimension: string` (written as Bedrock's `DimensionId` int and read back through `dimensionByName`), `spawn.dimension` additionally lands in Bedrock's `SpawnDimension` int, and entity NBT gets `DimensionId`. `buildLevelDat` should write `Generator` (1 for Infinite, 2 for Flat), `FlatWorldLayers` when the Overworld is flat, `NetherScale` 8, and `Time`, so a save opened in the game shows the right type and clock.

For Anvil the directory per dimension is `dimensions/<namespace>/<path>/region`, falling back to `DIM-1` and `DIM1` when reading a pre-26.1 save. Nothing else in the Anvil stub is worth keeping.

## 2. Chunk pipeline

### 2.1 Who owns the workers

`GeneratorManager` builds one instance of every class in `generators/Generators.ts` (`Flat`, `Overworld`) and hands the same instance to every world that names it; the constructor comment says so and the shutdown hook stops them all at once. `Overworld.require()` lazily builds one `DataDrivenGenerator` with a `stages` pool of `chunkWorkerCount()` workers, which is `min(6, availableParallelism() - 2)` (`generators/chunkConcurrency.ts`).

`DataDrivenGenerator` is where the dimension is fixed. Its options (`DataDrivenGenerator.ts` lines 104 to 112) are `dimension` (default `Dimensions.Overworld`), `noiseSettings` (default `minecraft:overworld`) and `biomeParameters` (default `minecraft:overworld`), and the class comment reads "One instance covers one dimension and caches everything that depends only on the seed". `pipelineFor(seed)` (line 1810) caches a `SeededPipeline` per seed, so one instance already serves several worlds on different seeds, which is how two Overworld worlds share a pool today.

What crosses the thread boundary:

- Once per pool, in `workerData`, the `ChunkPipelineSetup` (`chunkPipeline.ts` lines 37 to 52): `registryBundle` as a `SharedArrayBuffer` of UTF-8 JSON, `dimension`, `noiseSettings`, `biomeParameters`, `carve`, `structures`, `javaTemplates`. The worker builds one `DataDrivenGenerator` from it on its first task (`generationWorker.ts`, "The module the pool names is imported once, on the first task, and what it builds is kept for the life of the worker").
- Per task, a `GenerationTask` (`GenerationPool.ts` lines 86 to 101): `status`, `chunkX`, `chunkZ` and an `input` that is `{ seed: string, beard, junctions }` for `terrain` or `{ seed: string, terrain: GenerationRegionPayload[] }` for `features`. The seed is a decimal string "because a `bigint` does not survive every clone".

So the settings id is pool state and the seed is task state. Three dimensions each with their own generator today means three `DataDrivenGenerator` instances, each opening its own `GenerationPool`, each with up to six workers, and each worker holding its own parsed registries (the bundle is shared, the parsed objects are not). Eighteen V8 isolates on an eight core machine is the cost the current layout implies.

The smaller change is to make the settings part of the task. `ChunkTaskInput` grows `noiseSettings` and `biomeParameters` (or one `dimension` id the worker resolves), and the worker-side generator keeps a map from `(noiseSettings, biomeParameters, seed)` to `SeededPipeline` instead of a map from seed. The main-thread `DataDrivenGenerator` becomes one per server rather than one per dimension, with the `pipelines` map keyed the same way, and `Overworld.ts` turns into a thin `Generator` that names its settings. `ShardedGenerationPool.shardFor` hashes `chunkX >> regionShift, chunkZ >> regionShift` (line 167); with three dimensions sharing a pool, the dimension id has to enter that hash or two dimensions' chunk `(0, 0)` would always land on the same shard.

The `ChunkScheduler` in `packages/prismarine/src/world/ChunkScheduler.ts` is per server and knows nothing about worlds; it drains `ChunkRecipient` queues and calls `deliver(x, z)`. A player's queue lives in `PlayerSession`, so the dimension travels implicitly through `player.getWorld()`. That stays true if `World` keeps a `getChunk` forwarder for the player's current dimension.

### 2.2 What packages/worldgen can already generate

| Piece | Nether | End | Where |
|---|---|---|---|
| Biome source | `MultiNoiseBiomeSource`, tested against the `minecraft:nether` parameter list | `TheEndBiomeSource`: `the_end` inside radius 64 chunks, else `end_highlands`, `end_midlands`, `end_barrens`, `small_end_islands` by height | `worldgen/src/biome/BiomeSource.ts` lines 118 to 215, `biome.test.ts` lines 129 to 158 |
| Density functions | Standard router | `end_outer_islands` type parsed and compiled | `density/parse.ts` line 164, `density/compile.ts` line 230 |
| Random state | `minecraft:nether/temperature` and `minecraft:nether/vegetation` through the legacy octave chain | `endIslandRandom` as a `LegacyRandomSource(seed)` | `worldgen/src/RandomState.ts` lines 13 to 72 |
| Noise settings | Aquifers optional ("absent in dimensions that generate no aquifers"), `useLegacyRandomSource` honored | Same | `settings/NoiseGeneratorSettings.ts` line 74 |
| Surface rules | `minecraft:nether` preset exercised | Not exercised | `surface/surface.test.ts` line 79 |
| Carvers | `minecraft:nether_cave` exercised, with the height factor the nether raises to five | None in Java either | `carver/carver.test.ts` line 45, `Carver.ts` line 45 |
| Feature types | `FEATURE_TYPES` lists all 58 Java 26.3 types, including `delta_feature`, `huge_fungus`, `netherrack_replace_blobs` | `end_island`, `end_gateway`, `end_spike`, `end_platform`, `end_podium`, `chorus_plant` have bodies | `packages/features/src/features/Feature.ts`, `structural.ts` lines 865 to 1053 |
| Structures | `nether_fossil`, `ruined_portal` (`in_nether`), bastion through `jigsaw`. No `fortress`. | No `end_city`. | `javaStructureTypes.ts` lines 6 and 21 to 34 |

What is missing is wiring rather than algorithms. `DataDrivenGenerator` builds `MultiNoiseBiomeSource.fromJson(parameters)` unconditionally (line 612), so the End's biome source cannot be chosen; a `biomeSource` option that resolves `the_end` to `TheEndBiomeSource` is the one-line gap. `Overworld.ts` passes neither `dimension` nor `noiseSettings`. `Flat.ts` builds `new Chunk(cx, cz)` with the default Overworld dimension (line 9) and ignores whatever dimension the world has. The nether fortress and end city need builders (Java generates both from code, as the storage note's `java-code-only-behavior.md` records), and the structure placement layer already drops a structure set "whose every structure names biomes this dimension does not have" (`javaStructurePlacement.ts` line 9), so the nether's and end's sets activate as soon as the dimension's biome list changes. Whether `reports/biome_parameters` contains a `minecraft:nether` entry on a warm cache was not verifiable here: the cache under `node_modules/.cache/jsprismarine` was not present in this checkout.

## 3. Networking

### 3.1 Every packet that carries a dimension

Sources: the packet files under `packages/protocol/src/packet/` and `wire/definitions/`, and Mojang's bedrock-protocol-docs for 1.26.51, whose `DimensionType` is documented as "0 -> Overworld, 1 -> Nether, 2 -> The End, 3 -> Undefined".

| Packet | Dimension field | Codec | Server side today |
|---|---|---|---|
| `StartGame` | `LevelSettings.SpawnSettings.Dimension` varint32, plus `Generator Type` (0 Legacy, 1 Overworld, 2 Flat, 3 Nether, 4 TheEnd, 5 Void, 6 Undefined) and `Nether Type` boolean | `wire/definitions/startGame.ts` lines 255 to 257 | Filled from `world.getDimension().id`; generator is `FLAT` or `OVERWORLD` by `instanceof Flat` (`network/startGameData.ts` lines 67 to 68) |
| `DimensionData` (id 180) | `Definitions` map of identifier to `DimensionDefinition` (`Minimum Y`, `Height Range`, `Generator Type`, `Dimension Type`, `Pack Id`, `Default Biome`) | `packet/DimensionDataPacket.ts`, `structure/DimensionDefinition.ts` | Implemented both ways, never sent. Vanilla sends it only when a behavior pack registers a custom dimension; the three vanilla ids keep their built-in heights |
| `ChangeDimension` (id 61) | `Dimension ID` varint32, `Position`, `Respawn`, optional `Loading Screen Id` | `wire/definitions/worldStatus.ts` line 63 | Sent by `Player.setWorld` as a Nether and back pair, twice, to make the client drop terrain (`Player.ts` lines 522 to 560). The doc says the destination "must differ from the client's current dimension" |
| `LevelChunk` (id 58) | `Dimension Id` varint32, then `Sub-chunks Count` varuint32 | `wire/definitions/levelChunk.ts` line 62 | `PlayerSession.ts` line 504 sends `chunk.getDimension().id` and `chunk.getNetworkSubChunkCount()`; the count is `getTopEmpty() - minSubChunk(clientRangeOf(dimension))`, and `networkSerialize` pads from the client's floor for that id and writes `subChunkCount(client)` biome sections, 24, 8 or 16 (`chunk/Chunk.ts` lines 18 to 25, 497 to 552) |
| `SubChunkRequest` (id 175) | `Dimension Type` varint32, offsets, center | `packet/SubChunkRequestPacket.ts` | Decoded; `SubChunkRequestHandler` logs "The server does not offer sub chunk requests". `LevelChunk` is sent with `clientSubChunkRequestsEnabled: false` |
| `SubChunk` | `Dimension Type` varint32, with result codes for "player was in another dimension" and "y outside the dimension's range" | `packet/SubChunkPacket.ts` lines 25 to 62 | Codec only |
| `SetSpawnPosition` | `Dimension type` varint32 between `Block Position` and `Spawn Block Pos` | `wire/definitions/worldStatus.ts` line 41 | Sent once at join with `world.getDimension().id` (`ResourcePackClientResponseHandler.ts` line 272); never on a bed or a dimension change |
| `SpawnParticleEffect` | `Dimension Id` byte | `packet/SpawnParticleEffectPacket.ts` line 24 | `NetworkWorldReplicator.namedParticle` and `contentAdapter.ts` fill it from the world's dimension |
| `ClientboundMapItemData` | `dimension` byte | `packet/ClientboundMapItemDataPacket.ts` line 79 | Codec only |
| `AddVolumeEntity`, `RemoveVolumeEntity` | `Dimension Type` varint32 | `packet/AddVolumeEntityPacket.ts` line 24, `RemoveVolumeEntityPacket.ts` line 11 | Codec only |
| `ClientboundAttributeLayerSync` | `Attribute Layer Dimension` varint32 per layer, "custom ones from 1000" | `packet/ClientboundAttributeLayerSyncPacket.ts` line 37 | Codec only |
| `LegacyTelemetryEvent` | `PortalCreated.dimensionId`, `PortalUsed.sourceDimensionId` and `targetDimensionId` | `packet/LegacyTelemetryEventPacket.ts` lines 94 to 98 | Codec only |
| `ServerboundDiagnostics` | `dimension` string | `packet/ServerboundDiagnosticsPacket.ts` line 18 | Codec only |
| `PlayerAction` | `ChangeDimensionAck` action type | `packet/PlayerActionPacket.ts` line 19 | `PlayerActionHandler` line 315 acknowledges it with nothing to bring up to date |
| `PrimitiveShapes` | `Dimension ID` per shape | `packet/PrimitiveShapesPacket.ts` line 19 | Codec only |

Packets the task asked about that carry no dimension: `Respawn` is `Position`, `State` (`SearchingForSpawn`, `ReadyToSpawn`, `ClientReadyToSpawn`) and `Player Runtime Id`; `NetworkChunkPublisherUpdate` is `BlockPos`, radius and a `ChunkPos` list; `MoveActorAbsolute` is runtime id, header, position and three rotations (bedrock-protocol-docs 1.26.51 pages for each). They apply to whatever dimension the client currently believes it is in, which is why the order of `ChangeDimension` against the first `LevelChunk` matters.

### 3.2 Gaps

1. `ChangeDimension` is used as a terrain-flush trick rather than a dimension change. With real dimensions, `Player.setWorld` becomes `Player.setDimension(dimension, position)`: one `ChangeDimension` naming the destination, `PlayStatus.PlayerSpawn` after the client's `ChangeDimensionAck`, then the chunk queue. The Nether-and-back pair stays only for a move between two worlds of the same dimension id, since the client refuses a change to its current dimension.
2. `SetSpawnPosition` goes out once at join with the join world's dimension. A player whose respawn point is in another dimension needs it resent with that dimension, and `RespawnPoint.dimension` already holds the namespaced name.
3. `StartGame`'s `Generator Type` is decided by `instanceof Flat`; with a config that names a generator per dimension it should come from the Overworld dimension's generator, and `Nether Type` should follow whether a Nether dimension exists.
4. `DimensionDataPacket` is only needed for a dimension whose id is not 0, 1 or 2 or whose height differs from the vanilla one; Mojang's doc says the three built-in ids keep their heights. A custom data-driven dimension needs the `Dimension Type` from 1000 up and a `Pack Id`, and the Bedrock dimension definition JSON currently only supports `generator_type: void` (minecraft.wiki, Dimension definition, Bedrock section), which bounds what a client will accept.
5. `SubChunkRequest` arrives with a dimension and is refused. If sub chunk requests are ever answered, the handler has to resolve the player's dimension from the packet rather than from the world.
6. `PlayerActionHandler` treats `ChangeDimensionAck` as a no-op. Once chunks are held back until the acknowledgement, this is where the destination's chunk queue starts.

## 4. Configuration and lifecycle

### 4.1 Today

`config/JsonConfigTypes.ts` defines `WorldData` as `{ seed: string | number; provider?: string; generator?: string; layers?: FlatLayer[] }` and `ConfigFile.worlds` as `Record<string, WorldData>`. The default is `{ world: { generator: 'Overworld', provider: 'LevelDB', seed } }` (`config/Config.ts` line 123). `utils/generate-schemas.cjs` runs `ts-json-schema-generator` over `JsonConfigTypes.ts` with `jsDoc: 'extended'` and writes `schemas/config.schema.json`, so a type change regenerates the schema with `pnpm --filter @jsprismarine/prismarine run generate`; `JsonSchemas.test.ts` checks the result. `docs/running.md` lines 44 to 50 and 225 to 245 document `generator`, `provider` and the string seed.

`WorldManager.enable` loads only the `level-name` entry. `buildWorld` looks up the provider class and `getGenerator(worldData.generator ?? 'Flat')`, builds `new World({... generator, config: { ...worldData } })` and never sets `dimension`, so every configured world is the Overworld. It then registers the world under `worldsByDimension` by `world.getDimension().name`, which `getWorldByDimension` reads and `Server.ts` line 296 hands to the content world as `worldFor`. The content runtime (`Server.getEntityRuntime(dimension: string)`) is keyed by dimension name, and `World.dataEntities()` passes `this.dimension.name`.

### 4.2 Proposed config shape

```jsonc
{
    "level-name": "world",
    "worlds": {
        "world": {
            "seed": "8475011743740320021",
            "provider": "LevelDB",
            "generator": "Overworld",            // still accepted: the Overworld dimension's generator
            "dimensions": {                      // new, optional
                "minecraft:overworld": { "generator": "Overworld" },
                "minecraft:nether":    { "generator": "Nether" },
                "minecraft:the_end":   { "generator": "TheEnd" }
            }
        }
    }
}
```

Rules that keep it backward compatible:

- A `WorldData` without `dimensions` loads exactly one dimension, `minecraft:overworld`, with `generator` (default `Flat`) and `layers`, which is today's behavior byte for byte.
- When `dimensions` is present, a top-level `generator` or `layers` is the default for `minecraft:overworld` and the loader warns if both name the Overworld generator differently.
- Each dimension entry is `{ generator?: string; layers?: FlatLayer[]; noiseSettings?: string; biomeSource?: string }`. Only `generator` is needed for the vanilla three; the other two are for a data-driven custom dimension and map straight onto `DataDrivenGeneratorOptions`.
- The dimension key is the namespaced name, which is what `Dimensions.*.name`, `dimensionByName` and the content world already use. Ids 0, 1 and 2 come from `dimensionByName`; a custom name gets an id from 1000 up and triggers `DimensionDataPacket`.
- `generator` names stay case-insensitive strings resolved by `GeneratorManager`, so `'Overworld'` and `'Flat'` keep working. `Nether` and `TheEnd` are new generator ids that are `DataDrivenGenerator` with `noiseSettings: 'minecraft:nether'` and `'minecraft:end'`.

Because the schema is generated from the TypeScript type, adding `dimensions?: Record<string, DimensionConfig>` with JSDoc on each field and running `generate` updates `config.schema.json`; the `@propertyNames` annotation already used on `worlds` constrains the keys. `docs/running.md` gets one paragraph under the seed section showing the `dimensions` map and stating that leaving it out gives an Overworld-only world.

### 4.3 World versus Dimension at runtime

The proposed split, with the field it owns in today's `World` beside each:

| `World` (one per save folder) | `Dimension` (one per entry in `dimensions`) |
|---|---|
| `name`, `uuid`, `provider`, `seed`, `config` | `definition: DimensionDefinition` (id, name, minY, height) |
| `gameRuleManager`, `currentTick`, `sendTime`, `weather` and `weatherCycle` (`World.ts` lines 1877 to 1918) | `generator`, `chunks: Map<number, Chunk>`, `loading`, `lastChunk*` cache |
| `players: Map<bigint, Player>` (the roster), `playerChunkRefCounts` | `entities`, `entityChunkIndices`, `entityGrid`, `dataEntities()` runtime |
| `spawn` (Bedrock's `SpawnX/Y/Z` is Overworld-only), `getPlayerData`, `savePlayerData`, `saveLevelData` | `systems: WorldSystems` (light, scheduled ticks, random ticks), `blockUpdates`, `physics`, `gameEventListenerRegistry` |
| `save`, `enqueueSave`, `closing`, `closed`, `startingRegion` | `changes: WorldChangeSink` (the replicator is per dimension because it broadcasts to players in it) |

Weather is a judgment call. Bedrock has one weather state per save and only renders it in the Overworld, so it stays on `World` and `Dimension` answers `isRainingAt` false when it has no ceiling and no weather.

Blast radius, measured by regex over `packages/prismarine/src` excluding tests: `getWorld()` appears 102 times in 38 files. `Position` carries a `World` (`world/Position.ts` line 20) and `Entity` takes its server from `position.getWorld().getServer()` (`entity/Entity.ts` line 231), so every entity reaches its world through its position. Per-dimension method call counts (any receiver): `setBlock` 32, `getBlock` 29, `getPlayers` 28, `getLoadedChunk` 26, `getEntities` 20, `getEntity` 20, `removeEntity` 12, `broadcastPacket` 9, `addEntity` 6, `getChunk` 2, `loadChunk` 2. Per-world: `getGameRuleManager` 14, `getTicks` 12, `getGameRule` 11, `weatherCycle` 6, `getSeed` 4, `getGenerator` 3, `getWeather` 2. `World` declares 84 public methods (listing in [Reproduction](#reproduction)).

The step that keeps the blast radius small is to introduce `Dimension` behind `World`. `World` gains `getDimension(name)` and `getDimensions()`, `Position` gains a dimension, and every existing per-dimension method on `World` forwards to the dimension of the position it is handed, or to the Overworld when a caller passes none. Call sites then migrate one domain at a time (`setBlock`/`getBlock` first since they are the most numerous and all take a position), and `getWorld()` keeps returning the save-level object, which is what the 14 `getGameRuleManager` and 12 `getTicks` callers want anyway. `WorldManager.worldsByDimension` becomes a lookup from dimension name to `(World, Dimension)` for the default world, which is all `Server.worldFor` needs. `Server.getEntityRuntime(dimension)` is already keyed by dimension name and needs no change.

## 5. Tests

Provider tests use a temp directory per test (`fs.mkdtempSync(path.join(os.tmpdir(), 'jsp-world-'))`, removed in `afterEach`) and a hand-rolled `harness()` that stubs `Server` with a logger and `World` with `getName`, `getSeed`, `getDimension: () => Dimensions.Overworld`, `getEntities` and `getServer` (`LevelDB.test.ts` lines 28 to 75, using `testing/stub.test.helper.ts`). Round trips already covered: blocks across the full height, y -64 and y 310, several chunks, block entities including an unmodeled one, biomes, the heightmap, the record set a vanilla chunk has, player data as `player_server_` NBT, the spawn under `SpawnX` tags, and world state in LevelDB plus `level.dat` (test names at lines 102 to 577). `DiskFormat.test.ts` lines 31 to 65 cover the key shapes for ids 0, 1 and 2. `VanillaWorld.test.ts` does a byte-exact round trip against a real game save when `.test/worlds/vanilla-1.21.40/` or `JSP_VANILLA_WORLD` exists, always on a copy.

Chunk payload assertions live in `chunk/ChunkNetworkPayload.test.ts`, including "pads and counts biomes for the range the client gives the dimension id, not the Overworld" (line 99) and the four empty sub chunks below y 0 (line 77). `PlayerSessionChunks.test.ts` and `PlayerSessionTracking.test.ts` build a `PlayerSession` over `stub<ClientConnection>` and a `stub<Player>` with a walkable position; `ClientConnection.test.ts` wraps `stub<RakNetTransportConnection>`. `testing/entityServer.ts` is the typed server double for entity tests, with `inertEntityRuntime()`. There is no fake Bedrock client in the prismarine tests; `packages/client/src/bot/Bot.ts` is a load-generation bot whose position is its own and that "knows where it started, from `StartGame`, and nothing after that", so it cannot assert a dimension change yet.

What a multi-dimension save/load round trip needs, in order:

1. In `DiskFormat.test.ts`: `encodeDigestKey(x, z, 1)` and the pending-entity key for a dimension, asserting the 16 and 12 byte lengths against the wiki's rule.
2. In `LevelDB.test.ts`: extend `harness` so the stubbed `World` answers `getDimension` per call or, after the API change, pass the dimension to `readChunk`. Write a Nether chunk (8 sub chunks, index 0 to 7) and an End chunk (16) and the Overworld chunk at the same x, z, then read all three back and assert no record leaks between them. `listChunks(dimension)` returns only its own. Assert the `Data3D` record carries 8, 16 and 24 biome sections.
3. Player record: write `WorldPlayerData` with `dimension: 'minecraft:nether'`, read it back, and read the raw `player_server_` compound to assert `DimensionId` is 1 and `SpawnDimension` matches the spawn.
4. Entity: write an actor into a Nether chunk and assert its `actorprefix` compound has `DimensionId` 1 and is listed only in the Nether digest.
5. `level.dat`: assert `Generator` 1, `NetherScale` 8, and `FlatWorldLayers` present only when the Overworld generator is `Flat`.
6. Network: a `PlayerSession` test over `stub<ClientConnection>` that records sent packets and asserts a dimension change sends one `ChangeDimension` with the destination id before any `LevelChunk` with that id, and that the `LevelChunk` sub chunk count for a Nether chunk is at most 8.
7. Parity: AGENTS.md requires a `packages/parity` family for a data-driven compatibility change. `worldgen.terrain` and `worldgen.biomes` exist (`parity/src/families.ts`); a `worldgen.dimensions` family that generates one chunk per vanilla dimension from the Java data and checks biome ids and height bounds against the data fixtures keeps the dashboard honest.

## 6. Recommendations

- Object model: one `World` per save folder owning provider, seed, clock, game rules, weather, player roster and saves; N `Dimension` objects owning chunks, generator, entities, systems and the change sink. Introduce `Dimension` behind `World` with forwarders, migrate `setBlock`/`getBlock` callers first.
- Provider API: one provider per save; `readChunk(dimension, cx, cz, ...)` and `listChunks(dimension)`; `writeChunk` reads the chunk's dimension; player and world data stay per save; write `DimensionId`, `SpawnDimension`, `Generator`, `NetherScale`, `FlatWorldLayers` and `Time` so the game reads the save as the server means it.
- Generation: move `noiseSettings` and `biomeParameters` from pool setup into task input and key worker pipelines by `(settings, seed)`, so one pool of `min(6, cores - 2)` workers serves every dimension; add a `biomeSource` option so `the_end` resolves to `TheEndBiomeSource`; give `Flat` the dimension it is asked for; add `Nether` and `TheEnd` generator ids; nether fortress and end city builders are the remaining structure work.
- Config: optional `dimensions` map keyed by namespaced name, each `{ generator, layers?, noiseSettings?, biomeSource? }`; absent map means Overworld-only and the top-level `generator`/`layers` keep their meaning; regenerate `config.schema.json` from the type and add one paragraph to `docs/running.md`.
- Networking gaps: `ChangeDimension` used as a flush trick instead of a dimension change; `SetSpawnPosition` sent once with the join dimension; `StartGame` generator type by `instanceof Flat`; `DimensionDataPacket` unsent (needed only for a non-vanilla id or height); `SubChunkRequest` refused with its dimension ignored; `ChangeDimensionAck` a no-op; `Respawn`, `NetworkChunkPublisherUpdate` and the move packets carry no dimension and so depend on packet order.

## Reproduction

```bash
# Dimension handling in the providers, the world layer, the network layer and the protocol
rg -n '[dD]imension' packages/prismarine/src/world/providers --glob '!*.test.ts'
rg -n '[dD]imension' packages/prismarine/src/network --glob '!*.test.ts'
rg -n -i 'dimension' packages/protocol/src/packet --glob '!*.test.ts' -l

# Blast radius
cd packages/prismarine/src
rg -c 'getWorld\(\)' --glob '!*.test.ts' . | awk -F: '{s+=$2} END {print s}'
for m in setBlock getBlock getLoadedChunk getEntities getEntity getPlayers getTicks \
         getGameRuleManager getGameRule weatherCycle getSeed getGenerator; do
  printf '%-20s %s\n' "$m" "$(rg -c "\.$m\(" --glob '!*.test.ts' . | awk -F: '{s+=$2} END {print s+0}')"
done
rg -n '^    public (async )?[a-zA-Z]+\(' world/World.ts | wc -l

# Worker setup versus task input
sed -n 37,60p world/generators/datadriven/chunkPipeline.ts
sed -n 84,102p ../../chunkgen/src/GenerationPool.ts

# Nether and end support in worldgen and features
rg -n -i 'nether|the_end|end_outer_islands' ../../worldgen/src --glob '!*.test.ts'
sed -n 1,66p ../../features/src/features/Feature.ts

# Primary sources (raw wikitext and rendered docs)
curl -sL 'https://minecraft.wiki/w/Bedrock_Edition_level_format?action=raw'
curl -sL 'https://minecraft.wiki/w/Bedrock_Edition_level_format/Entity_format?action=raw'
curl -sL 'https://minecraft.wiki/w/Bedrock_Edition_level_format/Other_data_format?action=raw'
curl -sL 'https://minecraft.wiki/w/Java_Edition_level_format?action=raw'
curl -sL 'https://minecraft.wiki/w/Dimension_definition?action=raw'
curl -sL 'https://learn.microsoft.com/en-us/minecraft/creator/documents/actorstorage?view=minecraft-bedrock-stable'
curl -sL 'https://mojang.github.io/bedrock-protocol-docs/1.26.51/packets/dimension-data-packet/'
curl -sL 'https://mojang.github.io/bedrock-protocol-docs/1.26.51/packets/level-chunk-packet/'
curl -sL 'https://mojang.github.io/bedrock-protocol-docs/1.26.51/packets/change-dimension-packet/'
curl -sL 'https://mojang.github.io/bedrock-protocol-docs/1.26.51/packets/set-spawn-position-packet/'
curl -sL 'https://mojang.github.io/bedrock-protocol-docs/1.26.51/types/dimension-definition/'
```
