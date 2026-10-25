# How does Java Edition generate a chunk?

Researched 2026-10-25. The primary source is Mojang's Java Edition 26.3 server jar, pinned at
`node_modules/.cache/jsprismarine/java-server/26.3/server.jar`, whose inner
`META-INF/versions/26.3/server-26.3.jar` holds the real class, field and method names (Mojang
removed obfuscation in 26.1, see [java-code-only-behavior.md](java-code-only-behavior.md)). Every
claim below cites a class and method in that jar. Where the jar is the only evidence, the file name
is given; where data confirms the shape, the cached vanilla datapack at
`node_modules/.cache/jsprismarine/vanilla-datapack/26.3/` is cited too. The reading was done with
`javap -c -p` and with CFR 0.152 decompilation; the commands are in "Reproduction". The last section
maps the model onto this repository.

## Summary

1. 26.3 has **ten** chunk statuses, not twelve. `ChunkStatus`'s static initializer registers
   `empty`, `structure_starts`, `structure_references`, `biomes`, `terrain`, `features`,
   `initialize_light`, `light`, `spawn`, `full`. `noise`, `surface` and `carvers` were merged into
   one `terrain` status whose task runs noise fill, surface materials and carvers back to back.
2. The dependency radii are declared in `ChunkPyramid.GENERATION_PYRAMID` and computed by
   `ChunkStep.Builder.buildAccumulatedDependencies`. Generating one chunk to `full` from nothing
   touches a 23x23 neighborhood at `structure_starts`, 7x7 at `biomes`, 5x5 at `terrain` and 3x3 at
   `features`. The full tables are in section 2.
3. Exactly one status may write blocks outside its own chunk: `features`, with
   `blockStateWriteRadius(1)`. `terrain` has radius 0. Every other step leaves
   `blockStateWriteRadius` at its default of -1, which makes `WorldGenRegion.isWithinWriteZone`
   false for every position, so those steps cannot write a block through the region at all.
4. A chunk is a `ProtoChunk` for all nine pre-`full` statuses and becomes a `LevelChunk` only in
   `ChunkStatusTasks.full`, on the main thread. Promotion reuses the same `LevelChunkSection[]`, so
   it is a wrapper swap, not a copy. The holder's lower-status futures are then replaced with
   `new ImposterProtoChunk(levelChunk, false)`, whose `setBlockState` returns null and writes
   nothing. A late write into an already-promoted chunk is therefore dropped, not applied.
5. `WorldGenRegion` is the only thing a generation step sees of the world. Its chunk cache is keyed
   by Chebyshev distance from the center and capped per distance by
   `ChunkStep.directDependencies()`. Asking for a chunk beyond that radius, or at a status above the
   cap for that distance, throws `ReportedException`. Writing outside the write zone logs through
   `Util.logAndPauseIfInIde` and `setBlock` returns false.
6. A tree straddling a chunk border comes out whole because `features` writes into the neighbor's
   `ProtoChunk` while that neighbor sits at exactly `terrain`, and the neighbor cannot reach `full`
   until every one of its own neighbors has passed `features` (`full`'s accumulated dependency at
   radius 1 is `initialize_light`, which is after `features`).
7. Java parallelizes two statuses and serializes the rest. `biomes` and `terrain` return
   `CompletableFuture.supplyAsync(..., Util.backgroundExecutor())`, a ForkJoinPool of
   `availableProcessors() - 1` threads, and both write only their own chunk. Everything else runs
   inline on a single `ConsecutiveExecutor` named "worldgen" (one task at a time), light runs on a
   second `ConsecutiveExecutor` named "light", and `full` runs on the main thread. The step that
   writes into neighbors is therefore never concurrent with itself.
8. Determinism comes from reseeding, not from ordering. Every random source used during generation is
   reseeded from the level seed plus a position plus a fixed index immediately before use, and no
   state carries from one chunk to the next. `WorldgenRandom.setDecorationSeed`,
   `setFeatureSeed`, `setLargeFeatureSeed` and the positional factories in
   `XoroshiroRandomSource.XoroshiroPositionalRandomFactory` are all pure functions of those inputs.
9. `GenerationChunkHolder.acquireStatusBump` is the concurrency invariant: a per-chunk
   `AtomicReference<ChunkStatus>` compare-and-exchanged from parent status to target status, so each
   (chunk, status) pair executes exactly once and never concurrently with another status of the same
   chunk. Losers share the winner's `CompletableFuture`.
10. Three of the defects this repository sees are prevented by construction in Java: the
    `minecraft:biome` placement modifier (`BiomeFilter`) rejects a feature at a position whose biome
    does not list it; the per-step candidate set is a deduplicated `IntArraySet` of global feature
    indices, so a feature shared by several biomes runs once per chunk; and carvers write a
    `CarvingMask` rather than blocks, with `applyCarvingMask` filling each masked cell from
    `Aquifer.computeSubstance(x, y, z, 0.0)`, the same function `doFill` uses. Section 8 spells each
    one out.

## 1. The ten statuses

`net/minecraft/world/level/chunk/status/ChunkStatus.class`, static initializer, in registration
order. Each `register(name, parent, heightmapsAfter, chunkType)` call sets `index = parent.index + 1`,
so the list is a chain and `isOrAfter` is an integer comparison.

| Index | Name | Chunk type | Heightmaps maintained after | Task (`ChunkStatusTasks`) |
|---|---|---|---|---|
| 0 | `empty` | `PROTOCHUNK` | `OCEAN_FLOOR_WG`, `WORLD_SURFACE_WG` | none; `ChunkMap.applyStep` short-circuits to `scheduleChunkLoad` |
| 1 | `structure_starts` | `PROTOCHUNK` | `OCEAN_FLOOR_WG`, `WORLD_SURFACE_WG` | `generateStructureStarts` |
| 2 | `structure_references` | `PROTOCHUNK` | `OCEAN_FLOOR_WG`, `WORLD_SURFACE_WG` | `generateStructureReferences` |
| 3 | `biomes` | `PROTOCHUNK` | `OCEAN_FLOOR_WG`, `WORLD_SURFACE_WG` | `generateBiomes` |
| 4 | `terrain` | `PROTOCHUNK` | all four final heightmaps | `buildTerrain` |
| 5 | `features` | `PROTOCHUNK` | all four final heightmaps | `generateFeatures` |
| 6 | `initialize_light` | `PROTOCHUNK` | all four final heightmaps | `initializeLight` |
| 7 | `light` | `PROTOCHUNK` | all four final heightmaps | `light` |
| 8 | `spawn` | `PROTOCHUNK` | all four final heightmaps | `generateSpawn` |
| 9 | `full` | `LEVELCHUNK` | all four final heightmaps | `full` |

`WORLDGEN_HEIGHTMAPS` is `EnumSet.of(OCEAN_FLOOR_WG, WORLD_SURFACE_WG)`; `FINAL_HEIGHTMAPS` is
`EnumSet.of(OCEAN_FLOOR, WORLD_SURFACE, MOTION_BLOCKING, MOTION_BLOCKING_NO_LEAVES)`.
`ProtoChunk.setBlockState` updates whichever set `getPersistedStatus().heightmapsAfter()` names, so a
feature writing into a neighbor keeps that neighbor's motion-blocking heightmap correct.

What each task does, from `ChunkStatusTasks`:

- **`generateStructureStarts`** calls `ChunkGenerator.createStructures(...)` when
  `generateStructures()` is on, then `ServerLevel.onStructureStartsAvailable(chunk)`. For every
  structure set whose `StructurePlacement.isStructureChunk(state, x, z)` accepts this chunk, it
  generates a `StructureStart` and stores it on the center chunk. It writes no blocks. The biome
  check happens before the structure is assembled, not after; section 8 has the order.
- **`generateStructureReferences`** builds a `WorldGenRegion` and calls
  `ChunkGenerator.createReferences(region, ..., chunk)`, which loops `sourceX, sourceZ` over
  `[-8, +8]` and, for every `StructureStart` in each of those 289 chunks whose bounding box
  intersects the center chunk's 16x16 column, records a reference. This loop is the reason the
  radius-8 requirement exists, and it is why `ChunkStatus.MAX_STRUCTURE_DISTANCE = 8`.
- **`generateBiomes`** calls `ChunkGenerator.createBiomes`, which runs
  `protoChunk.fillBiomesFromNoise(...)` on the background pool. It writes only its own chunk.
- **`buildTerrain`** calls `NoiseBasedChunkGenerator.buildTerrain`, which on the background pool runs
  `doFill` (density sampling plus `Aquifer.computeSubstance` into `LevelChunkSection`s, filling the
  `OCEAN_FLOOR_WG` and `WORLD_SURFACE_WG` heightmaps), then `buildSurface`
  (`MaterialSystem.buildSurface`), then `generateCarvers`. The task then calls
  `Heightmap.primeHeightmaps(chunk, {MOTION_BLOCKING, MOTION_BLOCKING_NO_LEAVES, OCEAN_FLOOR, WORLD_SURFACE})`.
- **`generateFeatures`** builds a `WorldGenRegion` and calls
  `ChunkGenerator.applyBiomeDecoration(region, chunk, structureManager)`, then
  `Blender.generateBorderTicks(region, chunk)`. Section 7 covers the decoration loop.
- **`initializeLight`** calls `chunk.initializeLightSources()`, hands the chunk the light engine, and
  calls `ThreadedLevelLightEngine.initializeLight(chunk, lighted)`.
- **`light`** calls `ThreadedLevelLightEngine.lightChunk(chunk, lighted)`.
- **`generateSpawn`** calls `ChunkGenerator.spawnOriginalMobs(new WorldGenRegion(...))` unless the
  chunk is upgrading. `NoiseBasedChunkGenerator.spawnOriginalMobs` delegates to
  `NaturalSpawner.spawnMobsForChunkGeneration`.
- **`full`** promotes the `ProtoChunk` to a `LevelChunk` on `context.mainThreadExecutor()`.

There is a second pyramid. `ChunkPyramid.LOADING_PYRAMID` has the same ten statuses but only four
tasks: `loadStructureStarts` at `structure_starts`, `initializeLight`, `light` (requiring
`initialize_light` at radius 1) and `full`. The other six steps are `ChunkStatusTasks::passThrough`
with no requirements. `ChunkGenerationTask.canLoadWithoutGeneration` picks between the two pyramids:
if the center chunk and every chunk inside the loading pyramid's accumulated radius are already
persisted at or past the required status, the chunk loads from disk and nothing is generated.

## 2. The dependency radii

`ChunkPyramid.GENERATION_PYRAMID` is built by ten `ChunkStep.Builder` calls. Each builder for a
non-first status starts with `directDependenciesByRadius = [parentStatus]`;
`addRequirement(status, radius)` widens the array to `radius + 1` entries, filling the new tail with
`status` and taking `ChunkStatus.max` on the overlap. The literal calls in the bytecode are:

| Step | `addRequirement` calls | `blockStateWriteRadius` |
|---|---|---|
| `empty` | none | default -1 |
| `structure_starts` | none | default -1 |
| `structure_references` | `(structure_starts, 8)` | default -1 |
| `biomes` | `(structure_starts, 8)` | default -1 |
| `terrain` | `(structure_starts, 8)`, `(biomes, 1)` | `0` |
| `features` | `(structure_starts, 8)`, `(terrain, 1)` | `1` |
| `initialize_light` | none | default -1 |
| `light` | `(initialize_light, 1)` | default -1 |
| `spawn` | `(biomes, 1)` | default -1 |
| `full` | none | default -1 |

### Direct dependencies

`ChunkStep.directDependencies()` is what `WorldGenRegion` enforces while the step runs. Read the row
as "while running this step, the chunk at Chebyshev distance d is guaranteed to be at least at this
status, and may not be requested at any higher status".

| Step | d=0 | d=1 | d=2 | d=3..8 | d>8 |
|---|---|---|---|---|---|
| `empty` | (none) | | | | not in region |
| `structure_starts` | `empty` | not in region | | | |
| `structure_references` | `structure_starts` | `structure_starts` | `structure_starts` | `structure_starts` | not in region |
| `biomes` | `structure_references` | `structure_starts` | `structure_starts` | `structure_starts` | not in region |
| `terrain` | `biomes` | `biomes` | `structure_starts` | `structure_starts` | not in region |
| `features` | `terrain` | `terrain` | `structure_starts` | `structure_starts` | not in region |
| `initialize_light` | `features` | not in region | | | |
| `light` | `initialize_light` | `initialize_light` | not in region | | |
| `spawn` | `light` | `biomes` | not in region | | |
| `full` | `spawn` | not in region | | | |

### Accumulated dependencies

`ChunkStep.accumulatedDependencies()` is the transitive closure that the scheduler uses to decide how
wide each layer must be. The list is indexed by distance and is monotonically non-increasing in
status.

| Step | accumulated dependency by distance (0, 1, 2, 3, 4..) | length |
|---|---|---|
| `empty` | (empty list) | 0 |
| `structure_starts` | `empty` | 1 |
| `structure_references` | `structure_starts` x 9 | 9 |
| `biomes` | `structure_references`, then `structure_starts` x 8 | 9 |
| `terrain` | `biomes`, `biomes`, then `structure_starts` x 8 | 10 |
| `features` | `terrain`, `terrain`, `biomes`, then `structure_starts` x 8 | 11 |
| `initialize_light` | `features`, `terrain`, `biomes`, then `structure_starts` x 8 | 11 |
| `light` | `initialize_light`, `initialize_light`, `terrain`, `biomes`, then `structure_starts` x 8 | 12 |
| `spawn` | `light`, `initialize_light`, `terrain`, `biomes`, then `structure_starts` x 8 | 12 |
| `full` | `spawn`, `initialize_light`, `terrain`, `biomes`, then `structure_starts` x 8 | 12 |

Inverting the `full` row through `ChunkDependencies.getRadiusOf` gives the number this design turns
on, the radius each status must reach before the center chunk can become `full`:

| Status | Radius required around a chunk reaching `full` | Neighbourhood |
|---|---|---|
| `empty` | 11 | 23x23 = 529 chunks |
| `structure_starts` | 11 | 23x23 = 529 chunks |
| `structure_references` | 3 | 7x7 = 49 chunks |
| `biomes` | 3 | 7x7 = 49 chunks |
| `terrain` | 2 | 5x5 = 25 chunks |
| `features` | 1 | 3x3 = 9 chunks |
| `initialize_light` | 1 | 3x3 = 9 chunks |
| `light` | 0 | the chunk itself |
| `spawn` | 0 | the chunk itself |

Two derived constants confirm these numbers. `ChunkLevel.RADIUS_AROUND_FULL_CHUNK` is
`GENERATION_PYRAMID.getStepTo(FULL).accumulatedDependencies().getRadius()`, which is `12 - 1 = 11`,
and `ChunkLevel.MAX_LEVEL = 33 + 11 = 44`. `ChunkPyramid.SAFETY_MARGIN_CHUNKS` is
`(32 + accumulatedDependencies(FULL).size() + 1) * 2 = (32 + 12 + 1) * 2 = 90`, which is what
`MAX_CHUNK_COORDINATE_VALUE` subtracts from the world border.

### The write radius

`ChunkStep.blockStateWriteRadius` defaults to -1 and is only set twice: 0 for `terrain`, 1 for
`features`. `WorldGenRegion.isWithinWriteZone(chunkX, chunkZ)` is
`abs(centerChunkX - chunkX) <= writeRadius && abs(centerChunkZ - chunkZ) <= writeRadius`, so a radius
of -1 is false everywhere including the center chunk. Steps with the default therefore cannot write
a block through the region. `generateBiomes` and `buildTerrain` sidestep this by writing straight to
the `ChunkAccess` they were handed rather than through a region.

Entity adds are not covered by the write zone. `WorldGenRegion.addFreshEntity` calls
`this.getChunk(xc, zc).addEntity(entity)` with no `ensureCanWrite` check, so `generateSpawn` can add
an entity anywhere inside its direct-dependency radius, which for `spawn` is distance 1.

## 3. `ProtoChunk` against `LevelChunk`

`ChunkAccess` is the shared base. `ProtoChunk` (`world/level/chunk/ProtoChunk.java`) is what every
status below `full` operates on. It holds:

- `LevelChunkSection[]` with the palettes for blocks and biomes, inherited from `ChunkAccess`.
- `volatile ChunkStatus status`, the persisted status, advanced by
  `ChunkStep.completeChunkGeneration` after the task's future resolves.
- Heightmaps, keyed by `Heightmap.Types`, lazily primed by `setBlockState` when the current status
  demands a map that does not exist yet.
- `List<CompoundTag> entities`, serialized entities rather than live ones, plus `blockEntities` and
  `pendingBlockEntities` (NBT with `id: "DUMMY"` placeholders written by `WorldGenRegion.setBlock`).
- `ProtoChunkTicks<Block>` and `ProtoChunkTicks<Fluid>`, unordered scheduled ticks.
- Structure starts and references, the post-processing position lists, a `CarvingMask`-free surface,
  `BelowZeroRetrogen` state, and a nullable `LevelLightEngine`.

`ProtoChunk.setBlockState` is the write path. It refuses positions outside build height, skips a
no-op air write into an empty section, writes into the section, notifies the light engine only once
the status is at or after `initialize_light`, and updates whichever heightmaps
`getPersistedStatus().heightmapsAfter()` names.

Promotion happens in `ChunkStatusTasks.full`, inside
`CompletableFuture.supplyAsync(..., context.mainThreadExecutor())`. It constructs
`new LevelChunk(level, protoChunk, postLoadProcessor)`, which passes `protoChunk.getSections()`
straight through, so the block storage is shared rather than copied. It copies block entities, the
pending block entity NBT, the post-processing lists, structure starts and references, the final
heightmaps and the sky light sources. It then calls
`holder.replaceProtoChunk(new ImposterProtoChunk(levelChunk, false))`.

`GenerationChunkHolder.replaceProtoChunk` overwrites every future from index 0 up to but not
including `full` with a completed future holding that imposter. `ImposterProtoChunk` with
`allowWrites = false` returns `null` from `setBlockState`, ignores `setBlockEntity`, ignores
`addEntity` and ignores `setPersistedStatus`. The consequence for writes landing outside the chunk
being worked on is exact: while a neighbor is still a `ProtoChunk`, a feature write into it lands in
the shared section array and survives; once that neighbor has been promoted, the same write is
silently discarded. The dependency radii exist so the second case never happens during normal
generation.

## 4. `WorldGenRegion`

`WorldGenRegion(ServerLevel level, StaticCache2D<GenerationChunkHolder> cache, ChunkStep generatingStep, ChunkAccess center)`
is constructed fresh by each of `generateStructureReferences`, `generateBiomes`, `buildTerrain`,
`generateFeatures` and `generateSpawn`. It implements `WorldGenLevel`, so a feature sees something
that looks like a level and is in fact a window onto a square of chunk holders.

Its cache is derived from the task's `StaticCache2D` by `cache.map(...)`:

```java
int distance = center.getPos().getChessboardDistance(x, z);
ChunkStatus maxAllowedStatus = distance >= generatingStep.directDependencies().size()
    ? null
    : generatingStep.directDependencies().get(distance);
return maxAllowedStatus == null ? null : holder.getChunkIfPresentUnchecked(maxAllowedStatus);
```

So the region's bounds are the direct-dependency list, read as a radius, and the status it hands back
for each ring is the status that ring is guaranteed to have reached.

Reads. `getChunk(chunkX, chunkZ, targetStatus, loadOrGenerate)` recomputes the distance, finds the
cap, and returns the cached chunk only if `targetStatus.isOrBefore(maxAllowedStatus)`. Otherwise it
builds a `CrashReport` titled "Exception generating new chunk" with the requested and allowed
statuses, the distance and the generating step, and throws `ReportedException`. There is no fallback
and no on-demand generation. `hasChunk(x, z)` is just `distance < directDependencies().size()`.

`getBlockState`, `getFluidState`, `getHeight` and `findBlocksIn` additionally call
`warnIfReadOutsideWriteZone`, which logs "Detected unsafe terrain read during worldgen" through
`Util.logAndPauseIfInIde` when the read is outside the write radius and not the center chunk. The
read still succeeds. This is a correctness warning, not an enforcement.

Writes. `setBlock(pos, state, flags, updateLimit)` first calls `ensureCanWrite(pos)`. If
`isWithinWriteZone(pos)` is false it logs "Detected setBlock in a far chunk [x, z]" through
`Util.logAndPauseIfInIde` and returns false, and `setBlock` returns false without touching anything.
If the write is allowed, it fetches the chunk from the cache, calls `chunk.setBlockState`, updates
points of interest, and for a block with a block entity either creates the entity (when the target
chunk is already a `LEVELCHUNK`) or stores a `{"id": "DUMMY", x, y, z}` tag on the proto chunk.

This is the whole mechanism behind a tree that straddles a chunk border. When chunk C runs
`features`, the region's write radius is 1, so `TreeFeature` can place a log or a leaf into any of the
eight neighbors. Those neighbors are at exactly `terrain`: they are past noise, surface and carvers,
so the tree lands on finished ground, and they are not yet at `features`, so they are still
`ProtoChunk`s whose sections accept the write. Later, when the neighbor runs its own `features`
step, its trees write back into C by the same rule. Neither chunk can reach `full` until the other has
passed `features`, because `full`'s accumulated dependency at radius 1 is `initialize_light`, which is
after `features`. By the time the sections are handed to a `LevelChunk`, all nine contributions are
already in them.

`WorldGenRegion.getRandom()` is not a general-purpose random. It is
`randomState.getOrCreateRandomFactory(Identifier.withDefaultNamespace("worldgen_region_random")).at(center.getPos().getWorldPosition())`,
so it is derived from the level seed and the center chunk position.

## 5. How Java schedules this

### The objects

- `ChunkMap` (one per `ServerLevel`) owns the holder map, the `WorldGenContext`, the `RandomState`,
  and two dispatchers.
- `ChunkHolder extends GenerationChunkHolder` holds one `AtomicReferenceArray<CompletableFuture<ChunkResult<ChunkAccess>>>`
  of length 10, one slot per status, plus the ticket level.
- `ChunkGenerationTask` drives one chunk from `empty` to a target status.
- `ChunkTaskDispatcher` wraps a `ChunkTaskPriorityQueue` and a `TaskScheduler`.

### The executors

`ChunkMap`'s constructor creates both mailboxes over the same backing `Executor`, which
`MinecraftServer` sets to `Util.backgroundExecutor()`:

```java
ConsecutiveExecutor worldgen = new ConsecutiveExecutor(executor, "worldgen");
ConsecutiveExecutor light = new ConsecutiveExecutor(executor, "light");
this.worldgenTaskDispatcher = new ChunkTaskDispatcher(worldgen, executor);
this.lightTaskDispatcher   = new ChunkTaskDispatcher(light, executor);
```

`Util.backgroundExecutor()` is a `ForkJoinPool` sized
`Mth.clamp(availableProcessors() - 1, 1, getMaxThreads())`, where `getMaxThreads()` reads the
`max.bg.threads` system property and defaults to 255 (`Util.makeExecutor`,
`Util.maxAllowedExecutorThreads`).

`ConsecutiveExecutor` extends `AbstractConsecutiveExecutor`, which keeps an
`AtomicReference<Status>` and only submits itself to the backing pool after a
`compareAndSet(SLEEPING, RUNNING)`. Its `run()` pops and executes exactly one queued task, sets
itself back to sleeping, and re-registers. A `ConsecutiveExecutor` therefore runs one task at a time,
though successive tasks may land on different pool threads.

### The layer loop

`ChunkGenerationTask.create(chunkMap, targetStatus, pos)` allocates a `StaticCache2D` of radius
`GENERATION_PYRAMID.getStepTo(targetStatus).getAccumulatedRadiusOf(EMPTY)`, which is 11 for `full`,
and acquires a generation reference on all 529 holders up front. `runUntilWait` then loops:

```java
while ((waitingFor = this.waitForScheduledLayer()) == null) {
    if (this.markedForCancellation || this.scheduledStatus == this.targetStatus) { releaseClaim(); return null; }
    this.scheduleNextLayer();
}
return waitingFor;
```

`scheduleLayer(status, needsGeneration)` walks the square of radius
`pyramid.getStepTo(targetStatus).getAccumulatedRadiusOf(status)` and calls
`GenerationChunkHolder.applyStep` on every holder in it. A holder already past that status returns a
completed future and costs nothing. So for a target of `full` the layer widths are 11, 11, 3, 3, 2,
1, 1, 0, 0, 0 as in the table in section 2. The task yields on the first future that is not already
done, and `ChunkMap.runGenerationTask` reattaches it with `future.thenRun(() -> runGenerationTask(task))`.

### The invariant that makes concurrency safe

`GenerationChunkHolder.applyStep` is guarded by:

```java
private boolean acquireStatusBump(ChunkStatus status) {
    ChunkStatus parent = status == ChunkStatus.EMPTY ? null : status.getParent();
    ChunkStatus previousStarted = this.startedWork.compareAndExchange(parent, status);
    if (previousStarted == parent) return true;
    if (previousStarted == null || status.isAfter(previousStarted))
        throw new IllegalStateException("Unexpected last startedWork status: ...");
    return false;
}
```

`startedWork` is one `AtomicReference<ChunkStatus>` per chunk. The compare-and-exchange only succeeds
for the thread that moves the chunk from its parent status to the next one. Every other caller falls
through to `getOrCreateFuture(status)` and shares the winner's future. Two consequences follow. A
given (chunk, status) task body runs exactly once in the process. And two statuses of the same chunk
can never run at the same time, because the second cannot acquire until the first has completed its
future and advanced `startedWork`.

### What is parallel and what is serial

| Status | Where the task body runs | Writes blocks outside its own chunk? |
|---|---|---|
| `empty` | `ChunkMap.scheduleChunkLoad`, I/O pool then main thread | no |
| `structure_starts` | inline on the "worldgen" `ConsecutiveExecutor` | no |
| `structure_references` | inline on "worldgen" | no |
| `biomes` | `Util.backgroundExecutor().forName("createBiomes")`, parallel | no |
| `terrain` | `Util.backgroundExecutor().forName("buildTerrain")`, parallel | no (write radius 0) |
| `features` | inline on "worldgen" | yes, radius 1 |
| `initialize_light` | `ThreadedLevelLightEngine`, "light" `ConsecutiveExecutor` | no |
| `light` | "light" `ConsecutiveExecutor` | no |
| `spawn` | inline on "worldgen" | entities only, radius 1 |
| `full` | `context.mainThreadExecutor()`, the server thread | no |

The two statuses Java runs on many threads at once are exactly the two expensive ones, and both of
them are confined to a single chunk. The one status that writes into neighbors runs on a mailbox
that executes one task at a time, so chunk A's `features` and chunk B's `features` are never
concurrent even when both are eligible. `full` is on the main thread because it registers block
entities and tick containers with the live level, and because promotion must be ordered against
ticking.

Priorities. `ChunkTaskPriorityQueue` keeps `ChunkLevel.MAX_LEVEL + 2 = 46` buckets, one per ticket
level, and `pop()` takes the lowest non-empty bucket, which means the chunks nearest a player.
`ChunkTaskDispatcher` itself runs its bookkeeping on a four-priority `PriorityConsecutiveExecutor`
where level changes are priority 0, releases 1, submissions 2 and polling 3.

`ServerChunkCache.runDistanceManagerUpdates` calls `chunkMap.runGenerationTasks()` once per tick, and
also from `ServerChunkCache.MainThreadExecutor.pollTask`, so new tasks enter the system on the main
thread.

## 6. Determinism

The question is what guarantees a chunk generates identically regardless of the order chunks are
generated in or how many threads are running. The answer is that every random draw is reseeded from
(level seed, position, fixed index) immediately before use, and no generation step mutates state that
another chunk's step reads.

### Per-level state

`RandomState.create(noiseRegistry, levelSeed, noiseSettings)` is built once per `ChunkMap`. Its
constructor picks the algorithm from the noise settings:

```java
WorldgenRandom.Algorithm randomAlgorithm = useLegacyRandom ? Algorithm.LEGACY : Algorithm.XOROSHIRO;
this.random = randomAlgorithm.newInstance(seed).forkPositional();
```

`legacy_random_source` is `false` in the vanilla overworld, so `this.random` is an
`XoroshiroRandomSource.XoroshiroPositionalRandomFactory` holding a `(seedLo, seedHi)` pair drawn from
the seeded Xoroshiro128++ stream.

The factory offers three derivations, all pure:

- `at(x, y, z)` returns `new XoroshiroRandomSource(Mth.getSeed(x, y, z) ^ seedLo, seedHi)`.
- `fromHashOf(name)` returns a source seeded from `RandomSupport.seedFromHashOf(name)` (the MD5-128
  of the UTF-8 string, split into two longs) xored with `(seedLo, seedHi)`.
- `fromSeed(seed)` returns `new XoroshiroRandomSource(seed ^ seedLo, seed ^ seedHi)`.

`RandomState.getOrCreateNoise` and `getOrCreateRandomFactory` memoize into `ConcurrentHashMap`s keyed
by registry key and identifier. Two threads racing to create the same noise produce the same value,
so the cache is a performance device, not a source of order dependence.

### Per-stage seeding

| Stage | Source | Seed derivation |
|---|---|---|
| Noise router, density functions | `RandomState.getOrCreateNoise` | `Noises.instantiate(noises, positionalFactory, key)`, that is `fromHashOf(registry key)` |
| Legacy nether temperature and vegetation noise | `new LegacyRandomSource(seed + 0)` and `(seed + 1)` | fixed offsets, in `RandomState`'s `CompileContext` |
| End islands | `new LegacyRandomSource(seed)` | `createEndIslandRandom()` |
| Surface materials | `MaterialSystem.noiseRandom.at(blockX, 0, blockZ)` | positional, column-keyed; the clay bands come from `noiseRandom.fromHashOf("minecraft:clay_bands")` |
| Carvers | one `WorldgenRandom(new LegacyRandomSource(...))` reused, reseeded every iteration | `setLargeFeatureSeed(randomState.seed() + carverIndex, sourceChunkX, sourceChunkZ)` |
| Structure placement grid | `StructurePlacement.isStructureChunk` | the structure set's `salt`, `spacing` and `separation` |
| Structure start | `Structure.GenerationContext.makeRandom` | `new WorldgenRandom(new LegacyRandomSource(0)).setLargeFeatureSeed(levelSeed, chunkX, chunkZ)` |
| Structure selection within a multi-entry set | `new WorldgenRandom(new LegacyRandomSource(0))` | `setLargeFeatureSeed(levelSeed, chunkX, chunkZ)` |
| Feature decoration | `new WorldgenRandom(new XoroshiroRandomSource(RandomSupport.generateUniqueSeed()))` | `setDecorationSeed(levelSeed, originBlockX, originBlockZ)` then `setFeatureSeed(decorationSeed, featureIndex, stepIndex)` |
| Mob spawn pass | `new WorldgenRandom(new LegacyRandomSource(RandomSupport.generateUniqueSeed()))` | `setDecorationSeed(levelSeed, minBlockX, minBlockZ)` |
| `WorldGenRegion.getRandom()` | positional factory | `getOrCreateRandomFactory("minecraft:worldgen_region_random").at(centerChunkWorldPos)` |

The two `generateUniqueSeed()` calls look like a determinism hole and are not: both sources are
reseeded by `setDecorationSeed` before a single number is drawn. `RandomSupport.generateUniqueSeed`
mixes an atomic counter with `System.nanoTime()` and only matters if a caller forgets to reseed.

The arithmetic, from `WorldgenRandom`:

```java
public long setDecorationSeed(long seed, int chunkX, int chunkZ) {
    this.setSeed(seed);
    long xScale = this.nextLong() | 1L;
    long zScale = this.nextLong() | 1L;
    long result = (long) chunkX * xScale + (long) chunkZ * zScale ^ seed;
    this.setSeed(result);
    return result;
}

public void setFeatureSeed(long seed, int index, int step) {
    this.setSeed(seed + (long) index + (long) (10000 * step));
}

public void setLargeFeatureSeed(long seed, int chunkX, int chunkZ) {
    this.setSeed(seed);
    long xScale = this.nextLong();
    long zScale = this.nextLong();
    this.setSeed((long) chunkX * xScale ^ (long) chunkZ * zScale ^ seed);
}
```

`chunkX` and `chunkZ` in `setDecorationSeed` are block coordinates at the call sites:
`ChunkGenerator.applyBiomeDecoration` passes `origin.getX(), origin.getZ()` where
`origin = SectionPos.of(centerPos, level.getMinSectionY()).origin()`, and `spawnOriginalMobs` passes
`center.getMinBlockX(), center.getMinBlockZ()`.

`WorldgenRandom` itself extends `LegacyRandomSource` but delegates `next(int bits)` and `setSeed` to
the wrapped source, so a `WorldgenRandom(XoroshiroRandomSource)` draws from Xoroshiro128++ while
still exposing the `java.util.Random`-shaped API that the seeding helpers need.
`XoroshiroRandomSource.setSeed(long)` goes through `RandomSupport.upgradeSeedTo128bit`, which xors
with `0x6A09E667F3BCC909`, adds the 64-bit golden ratio for the high half and applies
`mixStafford13` to both halves.

### Why order and thread count do not matter

Three properties combine:

1. Every step reads only chunks inside its direct-dependency radius, and each of those is guaranteed
   to be at a specific status. `WorldGenRegion.getChunk` throws rather than returning a chunk at the
   wrong status, so an input that would vary with ordering is a crash, not a silent difference.
2. Every step writes only inside its `blockStateWriteRadius`, which is 0 or -1 for everything except
   `features`. The one step that writes wider runs on a mailbox that executes one task at a time.
3. Every random draw is a pure function of the level seed, a position and a compile-time index. No
   step draws from a counter, a clock, a hash of object identity or an iteration order that depends
   on which chunks exist.

`acquireStatusBump` then guarantees that each (chunk, status) body runs exactly once, so there is no
chance of a step being applied twice with different inputs.

The remaining order dependence is in the inputs, not the algorithm. The global feature index that
feeds `setFeatureSeed` comes from `FeatureSorter.buildFeaturesPerStep(List.copyOf(biomeSource.possibleBiomes()), ...)`,
so it depends on the biome source's biome list and on every biome's feature list. Changing the
datapack changes every feature seed in the world.

## 7. Feature placement order

`ChunkGenerator.applyBiomeDecoration(WorldGenLevel level, ChunkAccess chunk, StructureManager structureManager)`
is the whole decoration pass. In order:

1. `origin = SectionPos.of(centerPos, level.getMinSectionY()).origin()`, the chunk's minimum block
   corner at the bottom of the world.
2. `structuresByStep` groups the structure registry by `structure.step().ordinal()`.
3. `featureList = this.featuresPerStep.get()`, a memoized
   `List<FeatureSorter.StepFeatureData>`, one entry per decoration step, each holding the globally
   ordered `List<PlacedFeature>` for that step and an identity index lookup.
4. `random = new WorldgenRandom(new XoroshiroRandomSource(RandomSupport.generateUniqueSeed()))` and
   `decorationSeed = random.setDecorationSeed(level.getSeed(), origin.getX(), origin.getZ())`.
5. `possibleBiomes` is filled by iterating `ChunkPos.rangeClosed(sectionPos.chunk(), 1)`, the 3x3
   chunk neighborhood, calling `level.getChunk(x, z)` and collecting every biome in every section's
   palette, then `retainAll(this.biomeSource.possibleBiomes())`.
6. `for (stepIndex = 0; stepIndex < max(GenerationStep.Decoration.values().length, featureStepCount); stepIndex++)`.

`GenerationStep.Decoration` has eleven constants in this order: `raw_generation`, `lakes`,
`local_modifications`, `underground_structures`, `surface_structures`, `strongholds`,
`underground_ores`, `underground_decoration`, `fluid_springs`, `vegetal_decoration`,
`top_layer_modification`. A biome's `features` array in the datapack is indexed by the same order;
`data/minecraft/worldgen/biome/plains.json` in the cached 26.3 datapack has eleven entries with
counts `[0, 2, 1, 2, 0, 0, 29, 0, 2, 11, 1]`.

Within one step, structures go first:

```java
int index = 0;
for (Structure structure : structuresByStep.getOrDefault(stepIndex, List.of())) {
    random.setFeatureSeed(decorationSeed, index, stepIndex);
    structureManager.startsForStructure(sectionPos.x(), sectionPos.z(), structure)
        .forEach(start -> start.placeInChunk(level, structureManager, this, random,
                                             getWritableArea(chunk), centerPos));
    index++;
}
```

`index` here counts structures within the step, starting again at 0, so a structure and a feature in
the same step can share a feature seed. `getWritableArea(chunk)` is a `BoundingBox` covering only the
center chunk's 16x16 column from `minY + 1` to `maxY`, so structure pieces write into the center
chunk and nowhere else.

Then features:

```java
IntArraySet possibleFeaturesThisStep = new IntArraySet();
for (Holder<Biome> biome : possibleBiomes) {
    List<HolderSet<PlacedFeature>> featuresInBiome = generationSettingsGetter.apply(biome).features();
    if (stepIndex >= featuresInBiome.size()) continue;
    featuresInBiome.get(stepIndex).stream().map(Holder::value)
        .forEach(f -> possibleFeaturesThisStep.add(stepFeatureData.indexMapping().applyAsInt(f)));
}
int[] indexArray = possibleFeaturesThisStep.toIntArray();
Arrays.sort(indexArray);
for (int featureIndex = 0; featureIndex < indexArray.length; featureIndex++) {
    int globalIndexOfFeature = indexArray[featureIndex];
    PlacedFeature feature = stepFeatureData.features().get(globalIndexOfFeature);
    random.setFeatureSeed(decorationSeed, globalIndexOfFeature, stepIndex);
    placer.placeWithBiomeCheck(feature, random, origin);
}
```

Four things in that loop matter for an implementation.

**The index in the seed is global, not per biome.** `FeatureSorter.buildFeaturesPerStep` runs a
depth-first topological sort over the per-biome feature orderings and produces, per step, one list
whose order every biome agrees with. `globalIndexOfFeature` is the position in that list. Two chunks
in different biomes that share a feature give it the same seed.

**The candidate set is a set of indices.** A feature listed by six of the nine biomes in the 3x3
neighborhood is added six times to an `IntArraySet` and runs once. The count of feature invocations
per chunk per step is the size of the union, not the sum.

**The iteration is over sorted global indices.** The order is the same in every chunk in the world
for a given step, whatever biomes are present.

**The random is shared and reseeded per feature.** One `WorldgenRandom` serves the whole chunk; every
feature begins from `setFeatureSeed`, so no feature can see another's draws.

`FeaturePlacer.place` walks the `PlacementModifier` chain with an explicit stack:

```java
this.positions.add(origin);
this.modifierIndices.add(0);
while (!this.positions.isEmpty()) {
    BlockPos pos = this.positions.removeLast();
    int modifierIndex = this.modifierIndices.removeInt(this.modifierIndices.size() - 1);
    placement.get(modifierIndex).modify(context, random, pos, this.modifiedPositions::add);
    int next = modifierIndex + 1;
    if (next < placement.size()) {
        for (int i = this.modifiedPositions.size() - 1; i >= 0; --i) {
            this.positions.add(this.modifiedPositions.get(i));
            this.modifierIndices.add(next);
        }
    } else {
        for (BlockPos nextPos : this.modifiedPositions)
            placedAny |= feature.place(this.level, this.generator, random, nextPos);
    }
    this.modifiedPositions.clear();
}
```

It is a last-in-first-out walk with the children pushed in reverse, which reproduces the depth-first
order of the recursive stream version it replaced. Because all modifiers share the one `random`, the
traversal order fixes the draw sequence, so an implementation has to match it exactly.

`placeWithBiomeCheck` differs from `place` only in passing `Optional.of(placedFeature)` as the
context's `topFeature`, which is what `BiomeFilter` needs.

### Why features need the neighbors at an earlier status

Three reads in the pass cross the chunk boundary, and all three are satisfied by the radius-1
`terrain` requirement:

1. Collecting `possibleBiomes` reads the biome palettes of the 3x3 neighborhood, which requires
   those chunks to be at least at `biomes`.
2. Placement modifiers that resolve a height, `minecraft:heightmap` and
   `minecraft:surface_water_depth_filter`, call `WorldGenLevel.getHeight`, which reads the
   neighbor's heightmap. Those maps are only final after `buildTerrain` calls
   `Heightmap.primeHeightmaps`.
3. The feature body itself reads and writes blocks up to one chunk away, so the ground it lands on
   must already have had noise, surface and carvers applied.

Equally, the neighbors must not be past `terrain`. If a neighbor had already run `features`, it
would have been free to run its own `features` concurrently, and once it reaches `full` its sections
are behind a read-only `ImposterProtoChunk`. The dependency being exactly "`terrain` at radius 1" is
what pins the window.

## 8. What Java's structure prevents by construction

### Features landing on terrain they do not belong on

Two guards, applied in sequence.

The candidate list for a chunk is the union of the placed features of every biome in the 3x3
neighborhood, so a plains chunk next to an ice spikes chunk does consider `minecraft:trees_plains`
and `minecraft:trees_snowy` in the same pass. That is intentional: a tree rooted in plains must be
able to spill into the neighboring chunk.

The filter is the `minecraft:biome` placement modifier, `BiomeFilter`:

```java
public boolean shouldPlace(PlacementContext context, RandomSource random, BlockPos origin) {
    PlacedFeature feature = context.topFeature().orElseThrow(...);
    Holder<Biome> biome = context.getLevel().getBiome(origin);
    return context.generator().getBiomeGenerationSettings(biome).hasFeature(feature);
}
```

It rejects the candidate position unless the biome at that position lists this exact placed feature.
Every vanilla surface feature carries it: `placed_feature/trees_plains.json` ends its chain with
`{"type": "minecraft:biome"}`, as do `flower_plains`, `patch_pumpkin` and `ore_coal_upper`. A tree
whose root position falls on ice spikes is filtered out; a tree whose root is in plains is placed and
is allowed to grow across the border.

Note the modifier's position in the chain. In `trees_plains` it is last, after `heightmap` and the
`would_survive` check; in `flower_plains` it is in the middle, before a `count` of 64 and an `offset`.
So the biome test applies to the position the chain has reached, not to the chunk origin, and the
order of modifiers is part of the data.

Two further things keep a feature on ground it belongs on. The placement chain resolves its Y from
the finished heightmap of the chunk it is landing in, which exists because that chunk is at
`terrain`. And the structure part of the pass is clamped to `getWritableArea(chunk)`, a bounding box
that is exactly the center chunk's column.

### Carvers running in the air or inverted

Java's carvers do not place blocks. `WorldCarver.carve(context, random, targetChunkPos, sourceChunkPos, CarverOutput)`
receives a `CarverOutput`, and the only implementation passed during generation is `CarvingMask`, a
`BitSet` of 256 columns by the carvable height whose single mutating method is
`carve(int x, int y, int z)`. `WorldCarver.carveEllipsoid` clamps its indices to `[0, 15]` in x and z
and to `[output.minY(), output.maxY()]` in y before setting a bit, so the mask cannot address
anything outside the target chunk.

`NoiseBasedChunkGenerator.generateCarvers` builds the mask over a 17x17 loop of source chunks:

```java
CarvingMask mask = new CarvingMask(context.getMinGenY() + 1,
                                   context.getMinGenY() + context.getGenDepth() - 1 - protectedBlocksOnTop);
for (int dx = -8; dx <= 8; dx++) for (int dz = -8; dz <= 8; dz++) {
    ChunkPos sourcePos = new ChunkPos(pos.x() + dx, pos.z() + dz);
    BiomeGenerationSettings settings = carverBiomeRegion != null
        ? carverBiomeRegion.getChunk(sourcePos.x(), sourcePos.z())
              .carverBiome(() -> getBiomeGenerationSettingsForCarver(biomeResolver, sourcePos))
        : getBiomeGenerationSettingsForCarver(biomeResolver, sourcePos);
    int index = 0;
    for (Holder<WorldCarver> carverHolder : settings.getCarvers()) {
        random.setLargeFeatureSeed(randomState.seed() + index, sourcePos.x(), sourcePos.z());
        if (carverHolder.value().isStartChunk(random))
            carverHolder.value().carve(context, random, chunk.getPos(), sourcePos, mask);
        index++;
    }
}
```

`protectedBlocksOnTop` is 7 for a normal chunk and 0 for an upgrading one.

The fill happens once, in `applyCarvingMask`:

```java
mask.visit((x, z, bottomY, topY) -> {
    for (int worldY = topY; worldY >= bottomY; --worldY) {
        BlockState existing = chunk.getBlockState(blockPos);
        if (existing.is(BlockTags.UNCARVABLE)) continue;
        if (existing.is(Blocks.GRASS_BLOCK) || existing.is(Blocks.MYCELIUM)) hasGrass = true;
        BlockState state = aquifer.computeSubstance(worldX, worldY, worldZ, 0.0);
        if (state == null) continue;
        chunk.setBlockState(blockPos, state);
        ...
    }
});
```

`Aquifer.computeSubstance(x, y, z, density)` returns `null` when `density > 0` (meaning solid, so the
caller keeps the default block) and otherwise `fluidRule.computeFluid(x, y, z).at(y)`, which is
`blockY < fluidLevel ? fluidType : Blocks.AIR.defaultBlockState()`. Calling it with density exactly
`0.0` therefore yields air above the local fluid level and water or lava below, computed by the same
function that filled the chunk in the first place. A carved cell cannot be inverted, because the sign
convention is read from one place. A carved cell cannot be left floating in the air, because blocks
tagged `minecraft:uncarvable` are skipped and because the fill reuses the aquifer rather than
hardcoding air. Exposed dirt below grass is re-surfaced through
`MaterialSystem.topMaterial` in the same visit.

Two further details worth copying. The biome used to pick a source chunk's carver list is cached on
that chunk through `ChunkAccess.carverBiome(Supplier)`, so neighboring target chunks agree on it. And
the random is reseeded on every (source chunk, carver index) pair, so a carver's path does not depend
on how many carvers ran before it.

### Too many features per chunk

Per chunk, per decoration step, Java invokes each distinct placed feature exactly once. The
invocation count is `possibleFeaturesThisStep.size()`, the size of an `IntArraySet` of global feature
indices gathered from the 3x3 biome palette union. The multiplicity comes entirely from the placement
chain of each feature, which the data controls: `count`, `noise_threshold_count`, `rarity_filter`,
`in_square`, `heightmap`, `block_predicate_filter`, `biome`.

Three places where a naive implementation inflates the count:

1. Running the feature list per biome rather than per deduplicated index. `plains.json` lists 29
   features in `underground_ores` alone and shares most of them with every neighboring biome; a
   per-biome loop over a 3x3 palette can multiply that by nine.
2. Running the decoration pass once per chunk in a 3x3 region instead of once for the center chunk.
   Java runs `applyBiomeDecoration` exactly once per chunk, in that chunk's own `features` step.
3. Treating `count` as a count of successes rather than of candidate positions. Each position a
   `count` modifier emits is a candidate that the later filters, including `biome`, may reject.

### A structure assembled into a biome that refuses it

`Structure.generate` never assembles one. Read in order:

```java
Optional<GenerationStub> generation = this.findValidGenerationPoint(context);
if (generation.isPresent() && (testStart = new StructureStart(this, sourceChunkPos, references,
        (builder = generation.get().getPiecesBuilder()).build())).isValid()) {

public Optional<GenerationStub> findValidGenerationPoint(GenerationContext context) {
    return this.findGenerationPoint(context).filter(context::isValidBiome);
}
```

`GenerationStub` is `record GenerationStub(BlockPos position, Either<Consumer<StructurePiecesBuilder>,
StructurePiecesBuilder> generator)`, and `getPiecesBuilder()` is what runs the `Consumer` side. So
`findGenerationPoint` settles a position, the filter tests the biome there, and only a stub that
survives the filter has its pieces built.

The test itself is one lookup at one position, at biome quart resolution:

```java
public boolean isValidBiome(GenerationStub stub) {
    BlockPos startPos = stub.position();
    return this.validBiome.test(this.biomeResolver.getNoiseBiome(
        QuartPos.fromBlock(startPos.getX()),
        QuartPos.fromBlock(startPos.getY()),
        QuartPos.fromBlock(startPos.getZ())));
}
```

Every structure type whose `findGenerationPoint` returns the `Consumer` side therefore pays only
what it takes to settle the position. The two helpers most of them go through,
`Structure.onTopOfChunkCenter` and `SinglePieceStructure.findGenerationPoint`, read one to four
columns through `getFirstOccupiedHeight` and `getLowestY`. `JigsawPlacement.addPieces` places the
start piece, projects it onto the heightmap at the piece's own middle, and defers the whole
breadth-first walk:

```java
return Optional.of(new Structure.GenerationStub(new BlockPos(centerX, centerY, centerZ),
    arg_0 -> JigsawPlacement.lambda$addPieces$2(centerPiece, maxDepth, ...)));
```

One structure assembles first, and it has to. `MineshaftStructure.findGenerationPoint` runs
`generatePiecesAndAdjust` into a `StructurePiecesBuilder` and answers `Either.right` of it, because
the vertical settle those pieces make is what sets the stub's own y:

```java
int yOffset = this.generatePiecesAndAdjust(mineshaftPiecesBuilder, context);
return Optional.of(new Structure.GenerationStub(startPos.offset(0, yOffset, 0),
    (Either<...>)Either.right((Object)mineshaftPiecesBuilder)));
```

Three structures test more than the stub position, and all three do it inside
`findGenerationPoint`, before the stub exists. `SinglePieceStructure` and `Structure.onTopOfChunkCenter`
open with `couldValidBiomeExistOnTopOfChunkCenter`, which scans every biome quart of the column at
the chunk's middle and gives up if none of them is allowed. `WoodlandMansionStructure` does the same
for the column at offset 7. `OceanMonumentStructure` calls
`biomeResolver.getBiomesWithin(x, seaLevel, z, 29)` and refuses unless every biome in that radius is
in `BiomeTags.REQUIRED_OCEAN_MONUMENT_SURROUNDING`. These are extra refusals ahead of the one at the
stub position, not a different position for it, so none of them makes the stub position's biome test
depend on the assembly.

## 9. Mapping onto this repository

Read at commit `b78743ff28` with unrelated edits from another session in the tree. `deepslate` is not
installed and is not in `pnpm-lock.yaml`; `packages/worldgen/README.md` has a "Why not deepslate"
section recording that decision, so the comparison below is against the jar only.

### What already fits

The two libraries match Java's per-stage algorithms closely and are not the problem.

- Random sources. `packages/worldgen/src/random/XoroshiroRandomSource.ts` has
  `Xoroshiro128PlusPlus`, `XoroshiroRandomSource` and `XoroshiroPositionalRandomFactory`;
  `LegacyRandomSource.ts` has the legacy pair; `randomSupport.ts` has `mixStafford13`,
  `upgradeSeedTo128bit`, `seedFromHashOf` and `positionalSeed`. These are the same derivations
  section 6 lists.
- `packages/features/src/placement/WorldgenRandom.ts` reproduces `setDecorationSeed`,
  `setFeatureSeed`, `setLargeFeatureSeed` and `setLargeFeatureWithSalt`, including Java's trick of
  running `java.util.Random`'s formulas over a Xoroshiro bit stream.
- `packages/worldgen/src/RandomState.ts` is Java's `RandomState`: it picks the algorithm from
  `useLegacyRandomSource`, forks a positional factory, and memoizes noises and named factories.
- The terrain stack is complete and in the right shape:
  `packages/worldgen/src/density/{DensityFunction,parse,compile,SampleContext}.ts`,
  `packages/worldgen/src/settings/NoiseGeneratorSettings.ts` (the 26.3 eight-slot `NoiseRouter`),
  `packages/worldgen/src/chunk/{ChunkSampler,Aquifer,FluidPicker}.ts`,
  `packages/worldgen/src/surface/{MaterialRule,MaterialRuleContext,SurfaceSystem}.ts`,
  `packages/worldgen/src/biome/{BiomeSource,Climate,ClimateSampler,BiomeManager}.ts`.
- Carvers match Java's design. `packages/worldgen/src/carver/CarvingMask.ts` is the bitset,
  `carver/Carver.ts` has `carveChunk`, `isStartChunk` and `largeFeatureRandom`, and
  `DataDrivenGenerator.carve` fills each masked cell with
  `sampler.aquifer.computeSubstance(x, y, z, 0) ?? CAVE_AIR`, the same construction as
  `applyCarvingMask`. Two deltas: it skips a cell whose existing block is a fluid, where Java skips
  only `BlockTags.UNCARVABLE` and does overwrite water, and it does not run Java's
  grass-over-dirt re-surface through `MaterialSystem.topMaterial`.
- `packages/features/` carries all 58 feature types (`src/features/Feature.ts`), 18 placement
  modifiers (`src/placement/modifiers.ts`), the eleven `DECORATION_STEPS` in Java's order and a
  depth-first `placeFeature` (`src/placement/pipeline.ts`).
- `packages/prismarine/src/world/generators/datadriven/GenerationRegion.ts` already names
  `WorldGenRegion` as its model, defaults to `radius: 1` (Java's `blockStateWriteRadius(1)` for
  `features`), tracks cross-chunk writes with `beginWriteTracking` / `takeTrackedPatches`, and
  projects two seams, `surfaceChunk(): SurfaceChunk` and `featureWorld(): FeatureWorld`.

### What is shaped wrong

**`Generator` has no intermediate state.**
`packages/prismarine/src/world/Generator.ts` is one method,
`generateChunk(cx, cz, seed?, config?): Promise<Chunk>`. A chunk is either absent or a finished
Bedrock `Chunk`. There is nothing a neighbor can be handed partway through, which is the one thing
Java's design is built around. `grep -i 'chunkstatus|protochunk'` across `packages/worldgen`,
`packages/features` and `packages/prismarine/src/world` returns nothing.

**The 3x3 fan-out is a copy, not a window.** `DataDrivenGenerator.generateChunk`
(`packages/prismarine/src/world/generators/datadriven/DataDrivenGenerator.ts:206`) builds nine
independent `radius: 0` terrain regions through `terrainFor`, then merges all nine centres into one
`radius: 1` region with `copyCenterFrom`. Java never copies chunk data between chunks. Its region is
a map of holders, so a write into the neighbor lands in the neighbor's own sections. Here the
write lands in a scratch buffer and is replayed afterwards by `applyFeaturePatch`, which is where
the tree-across-the-border problem reappears: the patch is applied to the cached terrain region if
one is live, appended to `pipeline.featurePatches` for replay if the neighbor is built later, and
written straight into an already-returned `Chunk` with `applyPatchToChunk` if the neighbor has
already been handed out. Java's equivalent of that third case is
`ImposterProtoChunk(levelChunk, false)`, which drops the write. Mutating a chunk after it has been
emitted is the opposite choice, and it means a chunk already sent to a client can change.

**The decoration candidate set is global, not the 3x3 biome palette.** `buildFeaturePlan`
(`DataDrivenGenerator.ts:747`) walks `this.biomeSource.possibleBiomes()`, which for the overworld is
every biome in the world, and collects the union of their per-step feature lists into one
`ScheduledFeature[]`. `decorate` (`DataDrivenGenerator.ts:508`) then runs every entry of
`pipeline.planByStep.get(step)` in every chunk. Java runs the union of the nine chunks actually
present in the 3x3 neighborhood (`applyBiomeDecoration`, step 5 of section 7). This alone accounts
for the feature-count blowup, and for trees of biomes nowhere near the chunk being attempted.

**`minecraft:biome` is inert.** `biomeFilter` in
`packages/features/src/placement/modifiers.ts:157` is
`context.featureBelongsToBiome?.(origin) ?? true`, and `DataDrivenGenerator.decorate:512` builds
`const context = { world: region.featureWorld() };` with no `featureBelongsToBiome`. Every
`{"type": "minecraft:biome"}` in the data therefore accepts every position. The modifier's own
doc comment says "the chunk generator always supplies one", and the generator does not. With the
global candidate list above, nothing stands between a snowy tree and a plains chunk. This is the
direct cause of trees on ice spikes, and it is a small fix independent of the larger redesign.

**The feature index is offset by the structure count.** `buildFeaturePlan` adds
`structureStepCounts(registries.structures).get(step)` to each feature's index, with a comment
saying Java "counts a step's structures and its features through one index". The 26.3 jar does not.
In `ChunkGenerator.applyBiomeDecoration` the structure loop uses a local `int index` that restarts
at 0 inside every step, and the feature loop uses `globalIndexOfFeature`, which also starts at 0.
The two ranges overlap. The offset shifts every feature seed away from vanilla.

**The feature order is first-seen, not topologically sorted.** `buildFeaturePlan` dedupes with
`if (!list.includes(reference)) list.push(reference)` over biomes in `possibleBiomes()` order, and
the code comments call this an approximation. Java's `FeatureSorter.buildFeaturesPerStep`
(`packages/features` has no counterpart) runs a depth-first topological sort over the per-biome
orderings and throws `IllegalStateException("Feature order cycle found")` when they conflict. Since
that index feeds `setFeatureSeed`, an approximate order is an approximate world.

**The lock serializes everything.** `serializeGeneration` chains every `generateChunk` call for a
seed onto `pipeline.generationTail`, and it wraps the whole body including the nine terrain builds.
Java serializes only the task driver and the four cheap inline steps on one `ConsecutiveExecutor`,
and puts `biomes` and `terrain` on a ForkJoinPool. The repository's lock is in the right spirit and
at the wrong granularity: it protects the one step that needs it by also protecting the two that
would otherwise scale.

**Caching stands in for the holder.** `SeededPipeline` keeps three maps:
`terrainChunks: Map<string, Promise<GenerationRegion>>` (LRU-trimmed to
`GENERATION_CACHE_SIZE = 128`), `featurePatches: Map<string, RegionChunkPatch[]>` and
`generatedChunks: Map<string, Chunk>` (untrimmed). Together these approximate one slot of Java's
ten-slot `AtomicReferenceArray<CompletableFuture<...>>` per `ChunkHolder`. Caching a promise does
give the de-duplication that `acquireStatusBump` gives, but only for one status.

### What is missing entirely

| Java piece | Status here |
|---|---|
| `ChunkStatus`, ten statuses with an index and a parent | nothing |
| `ChunkStep`, `ChunkDependencies`, `ChunkPyramid` with per-distance requirements | nothing; the only radius is `GenerationRegion`'s hardcoded 1 |
| `blockStateWriteRadius` and `ensureCanWrite` | `GenerationRegion` bounds writes to its 3x3 window, but there is no per-step radius and no rejection path |
| `ProtoChunk` / `LevelChunk` split and `ImposterProtoChunk` | nothing; `Chunk` is the only chunk type |
| `GenerationChunkHolder` with per-status futures and `acquireStatusBump` | nothing |
| `ChunkGenerationTask` layer loop over a `StaticCache2D` | replaced by the 3x3 `Promise.all` in `generateChunk` |
| `structure_references` as a status (the 17x17 start scan) | structure starts exist (`javaStructureStarts.ts`), references do not |
| `initialize_light`, `light`, `spawn`, `full` as statuses | lighting lives in `packages/lighting`, spawning in `packages/spawning`, neither sequenced against generation |
| `ChunkTaskDispatcher`, `ChunkTaskPriorityQueue`, ticket levels | nothing; `serializeGeneration` is first-come-first-served |
| `FeatureSorter` topological sort | approximated by first-seen order |
| Per-chunk heightmaps as stored state | computed on demand in `GenerationRegion.heightmapPredicate` and `heightAt`; only `WORLD_SURFACE_WG` is frozen, by `freezeSurfaceHeights` |
| `Heightmap.primeHeightmaps` after terrain, and heightmap updates on feature writes | nothing |

### The shortest path to Java's behavior

The three defects in the brief have different costs. Supplying `featureBelongsToBiome` and
restricting the candidate set to the 3x3 palette are local changes inside
`DataDrivenGenerator.decorate` and `buildFeaturePlan`, and together they fix the wrong-biome
features and most of the feature-count blowup without touching the architecture. Dropping the
structure-count offset and replacing the first-seen order with a topological sort are also local,
and both move the seeds toward vanilla. The carvers are already correct in construction; the
remaining gap there is the fluid skip and the missing top-material restore.

The architecture change is the rest: a chunk that can exist at a named status, a holder that owns
one future per status, a step table with per-distance requirements, and a scheduler that advances
statuses in layers. That is what lets `terrain` run on many chunks at once while `features` keeps a
single writer, which is the arrangement that makes Java fast without making it nondeterministic.

## Open questions

- The jar does not say why `spawn` requires `biomes` at radius 1 rather than radius 0. The likely
  reason is that `NaturalSpawner.spawnMobsForChunkGeneration` reads biomes through the region's
  `BiomeManager`, which samples a 2x2x2 neighborhood of biome quarts and can cross the chunk
  boundary, but this note did not trace that call chain.
- `ChunkStatusTasks.full` is the only task on the main thread. Whether the cost is dominated by
  `registerAllBlockEntitiesAfterLevelLoad`, `registerTickContainerInLevel` or the entity load was not
  measured.
- This note did not establish what fraction of wall time a vanilla server spends in the serialized
  "worldgen" mailbox against the parallel `buildTerrain` tasks. The profiler zones exist
  (`scheduleLayer`, `doFill`, `buildSurface`, `generateCarvers`, `applyCarvingMask`, and a zone per
  status name from `ChunkStep.apply`), but running the server to collect them was out of scope.
- `ChunkPyramid.MAX_CHUNK_COORDINATE_VALUE` is computed from `BlockPos.MAX_HORIZONTAL_COORDINATE`,
  which is not a compile-time constant in the class file, so its value was not read here.
- `deepslate` could not be used as a cross-check: it is not in `node_modules` and not in
  `pnpm-lock.yaml`, and `packages/worldgen/README.md` records the decision not to depend on it.
  [cross-edition-worldgen-parity.md](cross-edition-worldgen-parity.md) section 8 says it has no
  carvers and no placed features, so it would not have covered the parts of the pipeline this note
  is about.
- `ChunkGenerator.applyBiomeDecoration` groups structures with
  `structuresRegistry.stream().collect(Collectors.groupingBy(...))`, so the order of structures
  within a decoration step is the registry's iteration order. This note did not establish what fixes
  that order, which matters because it feeds the structure branch of `setFeatureSeed`.

## Reproduction

```bash
# The pinned jar is a bundler; the real classes are in the nested server jar.
mkdir -p /tmp/jchunkgen/server && cd /tmp/jchunkgen/server
unzip -q -o \
  node_modules/.cache/jsprismarine/java/26.3/extracted/META-INF/versions/26.3/server-26.3.jar

# Bytecode, for the pyramid's invokedynamic targets and for compile-time constants.
javap -p -c net/minecraft/world/level/chunk/status/ChunkPyramid.class
javap -p -v net/minecraft/world/level/chunk/status/ChunkPyramid.class | awk '/^BootstrapMethods:/,0'
javap -p -c net/minecraft/world/level/chunk/status/ChunkStatus.class | sed -n '/static {}/,$p'
javap -constants -p net/minecraft/world/level/chunk/status/ChunkStatus.class | grep MAX_STRUCTURE
javap -constants -p net/minecraft/server/level/ChunkLevel.class

# Readable source, for everything else.
curl -sSL -o /tmp/jchunkgen/tools/cfr.jar \
  https://repo1.maven.org/maven2/org/benf/cfr/0.152/cfr-0.152.jar
for f in \
  world/level/chunk/status/ChunkStep world/level/chunk/status/ChunkDependencies \
  world/level/chunk/status/ChunkStatusTasks world/level/chunk/status/WorldGenContext \
  server/level/WorldGenRegion server/level/ChunkGenerationTask server/level/GenerationChunkHolder \
  server/level/ChunkMap server/level/ChunkTaskDispatcher server/level/ChunkTaskPriorityQueue \
  server/level/ChunkLevel world/level/chunk/ProtoChunk world/level/chunk/LevelChunk \
  world/level/chunk/ImposterProtoChunk world/level/chunk/ChunkGenerator world/level/chunk/CarvingMask \
  world/level/levelgen/NoiseBasedChunkGenerator world/level/levelgen/WorldgenRandom \
  world/level/levelgen/RandomState world/level/levelgen/RandomSupport \
  world/level/levelgen/XoroshiroRandomSource world/level/levelgen/GenerationStep \
  world/level/levelgen/Aquifer world/level/levelgen/carver/WorldCarver \
  world/level/levelgen/placement/FeaturePlacer world/level/levelgen/placement/BiomeFilter \
  world/level/levelgen/placement/InSquarePlacement world/level/biome/FeatureSorter \
  world/level/biome/BiomeGenerationSettings util/StaticCache2D util/thread/AbstractConsecutiveExecutor \
  util/thread/ConsecutiveExecutor util/thread/TaskScheduler util/Util util/Mth ; do
  java -jar /tmp/jchunkgen/tools/cfr.jar "net/minecraft/$f.class" \
    --outputdir /tmp/jchunkgen/src --extraclasspath . --silent
done

# The accumulated-dependency tables in section 2 were reproduced by reimplementing
# ChunkStep.Builder.buildAccumulatedDependencies in Python against the addRequirement
# calls read out of the ChunkPyramid bytecode; the check is that it yields
# SAFETY_MARGIN_CHUNKS = (32 + 12 + 1) * 2 = 90, matching the jar's static initializer.

# Datapack cross-checks.
cd node_modules/.cache/jsprismarine/vanilla-datapack/26.3/data/minecraft/worldgen
python3 -I -c "import json;b=json.load(open('biome/plains.json'));print(b['carvers']);print([len(s) for s in b['features']])"
python3 -I -c "import json;print([m['type'] for m in json.load(open('placed_feature/trees_plains.json'))['placement']])"
```
