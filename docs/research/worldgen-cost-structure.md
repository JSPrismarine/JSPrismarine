# Where world generation spends its CPU and memory

> **Read this first.** The counts in this note are the evidence. They come from instrumented runs that produced the same output digest as the uninstrumented benchmark, and they do not change with machine load. Every share of CPU samples and every millisecond figure is a wall-clock diagnostic from a shared machine. Per [AGENTS.md](../../AGENTS.md#measuring-performance), none of them shows that one design is faster than another. They say where to look, and a plan has to hold itself to the counts.

Measured 2026-11-21 at commit `b31164b5d01` on an Apple M1 Pro (8 cores: 6 performance, 2 efficiency, 16 GiB) with Node v26.12.1, for the terrain generation rearchitecture. Seed 1234, overworld, the default `minecraft:normal` preset. The machine was shared with other sessions. Each timed run lists its load average from `uptime` at its start and end.

The note builds on [worldgen-decoupling-baseline.md](worldgen-decoupling-baseline.md), [worldgen-throughput-first-candidate.md](../plans/worldgen-throughput-first-candidate.md) and [ADR 0002](../adr/0002-chunk-generation-architecture.md). Those three charged cost to statuses, `terrain` and `features`. This note goes one level down, into the density graph, the noise, the surface rules and the feature reads, and sorts each cost into one of three kinds:

- **Algorithmic.** Work Java Edition 26.3 also does for the same chunk: the Perlin octave arithmetic, the aquifer, the climate search, the carvers, feature logic.
- **Interpretation overhead.** Work that exists because the generator is a JavaScript interpreter of Java's data: closure dispatch per density node and per material rule, `Math.fround` around every float operation, string block states read through a region object, allocation and garbage collection.
- **Architectural.** Work the server's structure adds or repeats: terrain tiles generated around a request, registries parsed per process and per worker, tiles copied between threads, biomes searched twice.

## Summary

1. **Split of CPU samples (indicative).** In the single-thread full-pipeline profile, about 46% of samples are algorithmic, about 40% are interpretation overhead and about 7% are architectural phases. The other 7% are unattributed, mostly module loading. The overhead bucket is concentrated in four places. Density closure dispatch is 14.3%, `GenerationRegion` block access 11.5%, material-rule closures 7.3% and the interpolation and corner caches 3.4%. The Perlin octave kernel, the largest algorithmic item, is 13.4%.
2. **A multiplier sits across all three.** A request for an 8 by 8 block of chunks generates 144 terrain tiles and 100 feature passes, which is 2.25 tiles and 1.56 passes per chunk. The 441-chunk spawn preload generates 625 tiles and 529 passes, 1.42 and 1.20 per chunk. Java's dependency radii give it the same ring for the same request, so this is not waste relative to Java, but it is the largest single factor on time to first chunk.
3. **The three largest counts, per terrain tile.** These are 7.15 million `Math.fround` calls, 566,000 density closure calls and 84,100 Perlin octave samples. Java does the same 84,100 octave samples and none of the other two. It rounds with native `float` arithmetic and, in 26.3, evaluates the density graph one node at a time over a whole volume buffer (`DensitySampler.sampleVolume`), not one closure chain per block.
4. **Per block, the generator does less than Java.** A range proof skips 65.9% of a tile's 98,304 blocks as air or global fluid without a density sample. A tile takes 33,493 block-level density samples and 34,492 aquifer calls, where Java 26.3's `doFill` samples the whole volume and calls `Aquifer.computeSubstance` for every block. The per-block cost is in how each sample is computed: 13.4 closure calls and 36 `fround` calls per block sample, and 27.1 closure calls, 25.7 Perlin octaves and 14.4 smeared-noise octaves per interpolation corner.
5. **The corner lattice is Java-sized.** The fill computes 2,709 interpolation corners per tile, against Java's 1,225 per interpolated node on the 5 by 49 by 5 lattice. Java has five such nodes in `final_density`, up to 6,125 corners. The corner cache hits 84% of 21,275 lookups per tile.
6. **Surface rules and features are dominated by lookups, not arithmetic.** The surface pass evaluates the rule on 25,583 blocks per tile, at 9.7 rule closures and 4.9 condition closures per block, and reads 76,142 block states. A feature pass runs 48 placed features and makes 120,410 region reads, 88.7% of them from ore features.
7. **Duplication found.** Translation searches the climate tree again for biomes the terrain tile already sampled: 581 searches per chunk in the 8 by 8 run and 943 in the 441-chunk run, against 1,536 cells in a chunk. A feature task delivers its nine terrain tiles of about 199 KB each to a worker as copies. Every worker parses the 2.75 MiB registry set and reads the structure templates itself, and builds its own pipeline. Each worker's first task took 541 to 559 ms of CPU (indicative) and left 126 to 138 MB of heap.
8. **Seams a redesign must keep.** These are `Generator.generateChunk` returning a Bedrock `Chunk`, the status ladder and its step table, the `GenerationRegion` payload and the `FeatureWorld` and `SurfaceChunk` interfaces, the host protocol and reusable-input keys, and the bit-exact float order checked by the vectors in `packages/worldgen/vectors/26.3`, `golden.test.ts`, the parity `worldgen.*` families and the benchmark's output digest.

## 1. What the earlier notes settled

- `terrain` is 77.6% of worker CPU and `features` 17.8% in the one-worker `stages` arm this note ran (section 4), in line with the 83% and 17% that [the first-candidate pick](../plans/worldgen-throughput-first-candidate.md) recorded. That pick chose range analysis or generated code for the density graph, and asked for a profile inside a terrain task to decide between them. Section 2 is that profile, and section 3 adds the counts.
- Structure layout is small once candidates are rejected before assembly. In this profile, structure start work is 0.8% of samples.
- The WebAssembly terrain kernel was built and reverted (ADR 0002). Nothing here argues for or against bringing it back. The counts in section 3 say how much of the terrain work a kernel of that kind would cover.
- The density compiler already has two unused prototypes: `generatedFunctions` (JavaScript source generation per closed subtree) and `compileVolume` (a typed-array evaluator that falls back to scalar closures for every node except constants, unary and binary arithmetic and `clamp`). Nothing in `packages/prismarine` turns either on, and `ChunkSampler` takes `useVolumeDensity` only from tests. The production path is the closure compiler with `skipProvenCells` on.

## 2. Where the CPU goes

The single-thread `full` arm: 64 chunks in an 8 by 8 block, two warmups and three samples, profiled at a 250 µs interval. The profile holds 65,202 samples over 31.8 s, including the registry load. Load average 5.05 at start and 6.24 at the end. Each run took 6.08 to 6.54 s of process CPU for 64 chunks, about 95 to 102 ms per delivered chunk (indicative). The output digest was `b7740abd…c0b8` in every run.

Samples are attributed to a phase by the innermost matching frame on the stack, then to a kind by the leaf frame. Shares are of all samples.

### By phase

| Phase                                           | Share | What runs                                                                                     |
| ----------------------------------------------- | ----- | --------------------------------------------------------------------------------------------- |
| `terrain` fill (`ChunkSampler.forEachCellBlock`) | 27.3% | Per-block density and aquifer, corner evaluation for cells that are not skipped               |
| `terrain` surface (`SurfaceSystem.buildSurface`) | 20.7% | Material rules, including both ore veins, over every stone block below the surface start      |
| `features` (`featurePatchesFor`)                | 14.3% | The decoration pass over a nine-tile view                                                     |
| `terrain` skip proof (`interpolatedCellMaximum`) | 9.5%  | Corners of the main interpolated node for cells the range proof then skips                    |
| `terrain` biome cells (`sampleBiomeCells`)       | 5.8%  | 1,536 climate searches per tile, less memo hits                                               |
| `terrain` carvers (`carve`)                      | 5.6%  | Cave and canyon carvers, then opening the mask through the aquifer and the top material      |
| Registry loading                                | 4.4%  | `loadJavaWorldgenRegistries`, mostly JSON and file reads                                     |
| Unattributed                                    | 4.9%  | Module loading, the harness, frames with no phase on the stack                                |
| Translation (`toChunk`, `partsOf`)               | 2.5%  | Bedrock sections, biome sections (1.0% of the 2.5% is a second climate search), chunk storage |
| Garbage collection                              | 2.3%  |                                                                                               |
| Structure starts                                | 0.8%  |                                                                                               |
| Merge (`mergeFull`)                             | 0.7%  | Applying a chunk's own and its eight inbound patches                                          |
| Idle and program                                | 0.7%  |                                                                                               |
| Other `terrain` work                            | 0.5%  | Beard inputs, the tile writer                                                                 |

### By kind, sorted into the three buckets

| Kind                                                        | Share | Bucket         | Notes                                                                                     |
| ----------------------------------------------------------- | ----- | -------------- | ----------------------------------------------------------------------------------------- |
| Density closures (`compile.js` anonymous functions)         | 14.3% | Interpretation | 10.4% in the fill, 2.7% in the skip proof, 1.0% in the surface pass                       |
| Perlin octave kernel (`sampleAndLerp`, `smoothstep`, `wrap`) | 13.4% | Algorithmic    | 6.1% fill, 5.4% skip proof, the rest in surface, carvers, features                        |
| `GenerationRegion` access (`blockAt`, `columnIndex`, writes) | 11.5% | Interpretation | 7.1% inside features, 2.7% inside the surface pass                                        |
| Material rules (`MaterialRuleContext.js` closures)          | 7.3%  | Interpretation | Condition and rule closures, `lazyY` caching                                              |
| Climate search (`Climate.js`)                               | 6.8%  | Algorithmic    | 5.2% biome cells, 0.9% surface, 0.4% features; plus 1.0% inside translation               |
| Aquifer                                                     | 4.7%  | Algorithmic    | 4.0% fill, 0.6% carvers                                                                   |
| Biome lookup (`BiomeManager`, `BiomeSource`)                | 4.2%  | Algorithmic    | Java's position jitter, run by every `getBiome`                                           |
| Random sources                                              | 3.7%  | Algorithmic    | Deepslate gradient draws, carvers, features                                               |
| Feature code (`packages/features`)                          | 3.5%  | Algorithmic    |                                                                                           |
| Interpolation and corner caches (`SampleContext`)           | 3.4%  | Interpretation | Java interpolates too, so part of this is algorithmic                                     |
| Noise stacks and normal noise                               | 2.3%  | Algorithmic    |                                                                                           |
| Garbage collection                                          | 2.3%  | Interpretation |                                                                                           |
| Carvers                                                     | 2.1%  | Algorithmic    |                                                                                           |
| Surface system walk                                         | 1.8%  | Algorithmic    |                                                                                           |
| Chunk sampler walk                                          | 1.4%  | Algorithmic    |                                                                                           |
| Ore vein rule                                               | 1.2%  | Algorithmic    | Its density corners are counted under density closures and the Perlin kernel             |
| Generator glue (`DataDrivenGenerator.js`)                   | 1.1%  | Interpretation |                                                                                           |
| Registry loading, translation                               | 6.9%  | Architectural  | Java parses its registries once per server and does not translate                        |
| Unattributed                                                | 7.3%  |                | Module loading and frames outside every phase                                             |

Totals: algorithmic 45.5%, interpretation 40.3%, architectural 6.9%, unattributed 7.3%. The ring of extra tiles from summary item 2 is not a row, because it multiplies every terrain row. In this run, 80 of the 144 tiles and 36 of the 100 feature passes belong to chunks outside the 64 requested.

Two caveats on the bucket boundaries. The Perlin kernel's 13.4% includes its `Math.fround` calls, which are overhead next to Java's native `float` arithmetic. That pushes the true algorithmic share down and the overhead share up. `GenerationRegion` access is counted as overhead, but Java also reads palette containers, so some of it is algorithmic. Neither boundary can be drawn from a profile. The counts in section 3 are the better guide.

## 3. Counts per chunk and per tile

Counted by an instrumented copy of the same run. Each hot method was wrapped through its class prototype, every compiled density closure was wrapped through `DensityFunctionCompiler.prototype.compile`, and `Math.fround` was replaced before any module loaded. Three build-output files were patched for the duration of the count: the material rule compilers, the climate tree's node distance and a hook around `placeFeature`. All patches were reverted afterwards. The instrumented 64-chunk run produced output digest `b7740abd…c0b8`, the benchmark's, so the instrumentation changed no output.

A terrain tile is one chunk taken to the `terrain` status, which is the unit Java's per-chunk figures describe. Per-tile counts were the same within 10% between the 8 by 8 run and the 21 by 21 run, so they do not depend on the request shape. Per-chunk counts do, through the tile ratio.

### The noise fill

| Count, per tile                                         | This server | Java 26.3, same chunk                                                     |
| ------------------------------------------------------- | ----------- | ------------------------------------------------------------------------- |
| Blocks in the tile                                      | 98,304      | 98,304                                                                    |
| Blocks skipped by the range proof, no density sample     | 64,811      | 0. `doFill` samples the whole chunk volume                                 |
| Block-level `final_density` samples                     | 33,493      | One `sampleVolume` call over 98,304 positions                             |
| `Aquifer.computeSubstance` calls                        | 34,492      | 98,304, one per block inside `doFill`                                      |
| Aquifer `calculatePressure` calls                       | 3,729       | Same rule, applied to more blocks                                          |
| Interpolation corner lookups                            | 21,275      |                                                                           |
| Corners computed (cache misses) in the fill and skip proof | 2,709    | 1,225 per interpolated node (5 by 49 by 5), up to 6,125 for the five nodes |
| Corners computed for the ore vein trees (surface pass)   | 657         |                                                                           |
| Perlin octave samples, all terrain phases               | 84,143      | Same per evaluation; the evaluation count differs as above                |
| of which smeared (old blended noise) octaves            | 39,538      |                                                                           |
| Normal noise evaluations                                | 16,705      |                                                                           |
| Density closure calls, all terrain phases               | 566,452     | Per node per volume, not per sample                                      |
| `Math.fround` calls, all terrain phases                 | 7.15 million | None. Java rounds by computing in `float`                                 |

Per unit of work:

| Count                                       | Value | How it was obtained                                                                                                                   |
| ------------------------------------------- | ----- | ------------------------------------------------------------------------------------------------------------------------------------- |
| Closure calls per block-level density sample | 13.4  | Density closures in the fill outside corner and aquifer work, over `ChunkSampler.density` calls                                        |
| of which `interpolated` lookups             | 4.27  | `final_density` holds five interpolated nodes, and `range_choice` skips the noodle ones where it can                                   |
| `Math.fround` per block-level sample        | 36.0  | Counted in the same scope                                                                                                             |
| Closure calls per corner computed           | 27.1  | Density closures inside cache misses, over misses                                                                                     |
| Perlin octaves per corner computed          | 25.7  | Plus 14.4 smeared octaves                                                                                                             |
| `Math.fround` per corner computed           | 1,726 |                                                                                                                                       |
| `Math.fround` per Perlin octave sample      | 64    | From the code: 3 in `PerlinNoise.get3`, 61 in `sampleAndLerp` (16 for the gradient dots, 21 for three `smoothstep`s, 21 for seven lerps, 3 offsets) |
| `Math.fround` share in the Perlin kernel    | 74%   | 12.29 million of 16.56 million per chunk                                                                                              |
| Climate tree node visits per search         | 69    | `climateNodeDistance` calls over `find` calls in `sampleBiomeCells`                                                                   |

In optimized V8 code `Math.fround` becomes a truncation to single precision and a widening back, two instructions on top of the double operation, so 7.15 million of them are tens of millions of instructions per tile. That is derived from the instruction lowering, not measured.

The closure count is the structural difference from Java 26.3. `javap` on the pinned jar shows `DensitySampler.sampleVolume(SamplerContext, DensityBuffer, DensityVolume)` beside `sampleValue`, and `NoiseBasedChunkGenerator.doFill` calling `DensitySampler$Bound.sampleVolume` on the chunk's `DensityVolume`, then looping over the buffer and calling `Aquifer.computeSubstance` per block. Java dispatches once per node per volume. This server dispatches 13.4 times per block sample and 27.1 times per corner. Every closure of one kind shares its code, so each call site inside it sees many targets and V8 cannot inline across them.

### The surface pass

The overworld material rule is a sequence of the bedrock floor, the copper and iron ore veins, the surface rules above the preliminary surface and the underground rules. In 26.3 the ore veins are material rules, so the surface pass carries them.

| Count, per tile                                            | Value   |
| ---------------------------------------------------------- | ------- |
| Columns                                                    | 256     |
| Blocks the rule is evaluated on (stone below the start height) | 25,583  |
| Block states read (`stateAt`), walk and ceiling lookahead  | 76,142  |
| Rule closure calls                                         | 247,869 |
| of which `condition`                                       | 125,400 |
| of which `sequence`                                        | 55,700  |
| of which `ore_vein`                                        | 49,562, two per block |
| of which `block`                                           | 17,200  |
| Condition closure calls                                    | 125,386 |
| of which `vertical_gradient` (deepslate)                   | 50,000  |
| of which `biome`                                           | 30,900  |
| of which `above_preliminary_surface`                       | 24,700  |
| of which `stone_depth`                                     | 14,800  |
| of which `water`                                           | 5,100   |
| Condition results computed rather than cached (`lazyY`)    | 100,712 |
| `BiomeManager.getBiome` calls                              | 11,076  |
| Rules and conditions compiled                              | 316 rules and 153 conditions, every tile |

Java visits the same blocks with the same rule. The rule tree is recompiled into closures for every tile, because `buildSurface` builds a new `MaterialRuleContext` and calls `compileMaterialRule` each time. That is 469 compilations per tile, and it is overhead.

### Biomes

| Count                                        | Value              | Java                                      |
| -------------------------------------------- | ------------------ | ----------------------------------------- |
| Climate searches per tile, all terrain phases | 1,660              | 1,536 at `biomes`, one per 4 by 4 by 4 cell |
| Node visits per search                       | 69                 | Java's R-tree search with a warm start    |
| Climate searches per chunk in translation    | 581 (8 by 8), 943 (21 by 21) | None. The chunk already holds its biomes |
| Climate searches per feature pass            | about 107          |                                           |

Translation calls `packBiomeSections` when the merged region carries no biome sections, which a merged region never does, and that resolves every cell again through the biome memo. Where the memo has evicted the cell, the climate tree is searched a second time. This was counted on the single-thread path. The pooled path was not counted.

### The feature pass

Per decoration pass, 64-chunk run, 100 passes:

| Count                              | Value   |
| ---------------------------------- | ------- |
| Placed features run                | 48.3    |
| Region block reads                 | 120,410 |
| Heightmap reads                    | 19,918  |
| Block writes                       | 4,671   |
| `getBiome` calls                   | 429     |
| Perlin octave samples              | 3,875   |
| `Math.fround` calls                | 262,733 |

Reads by feature, the eight largest, as shares of all feature reads:

| Feature                      | Reads per run | Writes per run | Share |
| ---------------------------- | ------------- | -------------- | ----- |
| `minecraft:ore_dirt`         | 34,356        | 185            | 28.5% |
| `minecraft:ore_gravel`       | 17,501        | 345            | 14.5% |
| `minecraft:ore_coal_upper`   | 16,155        | 0              | 13.4% |
| `minecraft:ore_diorite_lower` | 8,095        | 757            | 6.7%  |
| `minecraft:ore_andesite_lower` | 7,295       | 801            | 6.1%  |
| `minecraft:ore_granite_lower` | 6,891        | 834            | 5.7%  |
| `minecraft:ore_copper`       | 4,153         | 45             | 3.4%  |
| `minecraft:ore_tuff`         | 3,916         | 1,205          | 3.3%  |

The `ore_*` features make 88.7% of feature reads. `ore_coal_upper` reads 16,155 blocks per run and writes none. The reads go through `FeatureWorld.getBlock(BlockPos)`, which returns a `BlockState` object resolved from a palette of string names. Whether Java's `OreFeature` reads as many positions for the same blobs was not counted, and is an open question below.

### Merge and translation

Per chunk: 7.55 patches applied, 4,453 block writes in the merge, and 29.7 Bedrock state lookups. Translation works on the palette, so it costs one lookup per distinct state and a reindexing of the buffer, not a lookup per block.

## 4. Architecture-level duplication and memory

### Terrain around a request

| Request                     | Chunks | Terrain tiles | Tiles per chunk | Feature passes | Passes per chunk | Merges |
| --------------------------- | ------ | ------------- | --------------- | -------------- | ---------------- | ------ |
| 8 by 8 block (the benchmark) | 64     | 144           | 2.25            | 100            | 1.56             | 64     |
| Spawn preload, radius 10    | 441    | 625           | 1.42            | 529            | 1.20             | 441    |
| A long walk, holders retained | n    | about n       | about 1         | about n        | about 1          | n      |

A chunk at `full` needs its neighbors at `features` and theirs at `terrain`, so a square of side s needs (s + 4)² tiles and (s + 2)² feature passes. Java's step table has the same radii, so it pays the same ring for the same request. The benchmark built no tile twice (`duplicateTerrainTileBuilds` 0). Holders are retained up to `RETAINED_HOLDERS` (512), which decides whether a player's next request reuses the ring or rebuilds it.

### What crosses threads and processes

From the code, with sizes measured on one tile: a terrain tile's payload holds 198,804 bytes of buffers plus 0.8 to 14 KB of structured fields.

| Hop, per chunk at steady state                     | Tile copies | Bytes, about |
| -------------------------------------------------- | ----------- | ------------ |
| `terrain` result, worker to host                    | 1           | 199 KB       |
| `terrain` result, host to server (`adoptRegion`)    | 1           | 199 KB       |
| `features` input, host to worker                    | 9           | 1.79 MB      |
| `full` input (merge and block pass), host to worker | 1           | 199 KB       |
| Total                                              | 12          | 2.4 MB       |

The host keeps each tile under a key (`ReusableCache`, 384 entries), so the server sends a tile to the host once and names it by key afterwards. The host still hands the tile's payload to a worker for each task that reads it. A feature task reads nine tiles and receives nine copies. In the 8 by 8 benchmark, scale the per-chunk rows by the ratios above.

### What each worker holds

The `stages` arm with one worker, 64 chunks, three samples, load average 3.98 at start and 3.29 at the end (indicative):

| Figure                                    | Value                                |
| ----------------------------------------- | ------------------------------------ |
| Worker CPU by status                      | `terrain` 77.6% (25.7 ms per task over 144 tasks), `features` 17.8% (8.5 ms over 100), `structure_starts` 3.3% (15 tasks), `full` 1.4% (1.0 ms over 64) |
| Worker heap after the first task          | 126 to 138 MB                        |
| Worker heap after a run                   | 70 to 113 MB                         |
| First task CPU (pipeline build plus a tile) | 541 to 559 ms                       |
| Process RSS, server thread and one worker | 565 to 602 MB                        |
| Server thread heap                        | 63 to 72 MB                          |
| Chunks per worker CPU-second              | 13.2 to 13.4                         |
| Output digest                             | `b7740abd…c0b8`, the single-thread arm's |

Each worker builds the following for itself, and the server thread builds them again:

| Item                                         | Size, counted               | Shared?                                                  |
| -------------------------------------------- | --------------------------- | -------------------------------------------------------- |
| Registries, 23 maps, 1,569 documents         | 2.75 MiB of JSON            | Bytes shared as one bundle, parsed per worker             |
| of which `biomeParameters` (2 lists)         | 1,449 KiB                   | Replaced by shared climate tables, 1,972,706 bytes        |
| of which `templatePools` (245)               | 471 KiB                     | No                                                       |
| of which `features` (240) and `placedFeatures` (273) | 295 KiB             | No                                                       |
| of which `biomes` (67)                       | 168 KiB                     | No                                                       |
| of which `densityFunctions` (55)             | 108 KiB                     | No                                                       |
| Structure templates                          | Read from the jar per worker | No                                                      |
| Noise permutation tables, compiled closures, material rules, structure sets | Per seed and key | No                                    |
| JIT-compiled code                            | Per isolate                 | No                                                       |

Loading the registries from disk on the server thread took 1,124 to 1,356 ms in these runs (indicative).

### Server startup

`tools/server-benchmark`'s terrain scenario on the CI runner (AMD EPYC 9V45, 4 logical CPUs, so `chunkWorkerCount` gives 3 workers, generation host on) recorded 62,710 ms of startup CPU and 3.03 GB peak RSS over two processes ([results.json](benchmarks/2026-11-21/results.json)). That machine is not this one, and its figures cannot be split with a profile taken here. Counted, the startup does this work:

| Work                                       | Count                                                         |
| ------------------------------------------ | ------------------------------------------------------------- |
| Registry loads from disk                   | 1, on the server thread                                       |
| Registry bundle parses and pipeline builds | 1 per worker, 3                                               |
| Structure template reads                   | 1 per worker, plus the server thread                          |
| Terrain tiles                              | 625                                                           |
| Feature passes                             | 529                                                           |
| Merges and translations                    | 441                                                           |
| Climate searches in translation            | about 416,000 (943 per chunk, single-thread path)             |

On this machine, the one-worker means above put the 625 tiles, 529 passes and 441 merges at about 21 s of worker CPU, and the registry and pipeline setup at about 1.2 s plus about 0.55 s per worker (indicative). On those figures the preload, not the registry loading, is most of the startup CPU. The tile count is 1.42 times the chunk count.

## 5. What a redesign must keep

### Parity checks that pin output

| Check                                                                                 | What it pins                                                                                                   |
| ------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------- |
| `packages/worldgen/vectors/26.3/*.json`, read through `vectors/vectors.ts`             | Java 26.3 outputs from `DumpWorldgenVectors.java`: random sequences, Perlin, simplex, smeared, normal and blended noise, router and aquifer density samples for all seven settings, spawn points, nine whole columns, surface columns, carvers, biome points and climate ties. Values are read as `float`, so a test compares bits |
| `packages/worldgen/src/noise/noise.test.ts`, `random/random.test.ts`                  | Noise and random sources against the vectors                                                                   |
| `packages/worldgen/src/density/density.test.ts`, `vanilla.test.ts`, `volume.test.ts`, `upscale.test.ts` | Density operators bit for bit, the generated-code prototype against closures across the vanilla corpus, cell bounds, the volume evaluator |
| `packages/worldgen/src/chunk/chunk.test.ts`, `golden.test.ts`, `cellSkip.test.ts`, `cellSize.test.ts` | Nine Java columns with aquifers, and six whole chunks (98,304 blocks each) hashed through the scalar and volume cell walks; the skip proof against full evaluation |
| `packages/worldgen/src/surface/surface.test.ts`, `carver/carver.test.ts`, `biome/biome.test.ts`, `blending/*.test.ts`, `spawn/NoiseSpawnFinder.test.ts` | Surface rules per condition type and over whole columns, carvers, biome lookup, blending, spawn |
| `packages/prismarine/test/chunkParity.ts`                                             | The same chunks built inline, through the whole-chunk pool, the stage pool and the generation host, byte for byte, with entity spawns and fluid ticks, for two dimensions at once |
| `packages/parity` families `worldgen.terrain`, `worldgen.generation`, `worldgen.determinism`, `worldgen.biomes`, `worldgen.blending`, `worldgen.dimensions`, `worldgen.spawn` | Java columns with both density evaluators, the committed generation corpus (`goldens/worldgen-corpus.json`), structure starts, order and pool-size independence, biome points |
| `bench:chunks` output digest                                                          | Identical bytes across arms and worker counts. `b7740abd…c0b8` for 64 chunks at seed 1234 at this commit      |

The float rule behind them is ADR 0002's guarantee 5: every operation rounds to `float` in Java's order, with no fused multiply-add and no reassociation. A kernel in another language carries a bit-pattern test per expression, not a tolerance.

### Interfaces the rest of the server reads

| Seam                                                                   | Consumers                                                                     |
| ---------------------------------------------------------------------- | ----------------------------------------------------------------------------- |
| `Generator.generateChunk(cx, cz, seed?, config?, options?): Promise<Chunk>`, `useStoredChunks` | `World`, `ChunkScheduler`, the preload, storage readers                 |
| `DataDrivenGenerator` queries: `locate`, `locateBiome`, `surfaceAt`, `spawnChunk`, `structureSpawnOverrideAt`, `unmappedStates`, `generationControl`, `raiseUrgency`, `forStem` | Commands, spawning, the world's spawn search, the scheduler |
| The status ladder and step table in `@jsprismarine/chunkgen` (`ChunkStatus`, `ChunkPyramid`, `ChunkStep`, `ChunkHolder`, `GenerationScheduler`) | The order-independence and exactly-once guarantees                     |
| `GenerationRegion` and its payload (`palette`, `states`, `highest`, `frozenSurface`, `biomeCells`, block entities, entity spawns, fluid ticks), `RegionChunkPatch` | Workers, the host, the merge, translation                              |
| `FeatureWorld` (`getBlock`, `setBlock`, `getHeight`, `getBiome`, `placeTemplate`, `spawnEntity`, `setBlockEntity`) | Every feature in `packages/features`, structure pieces                  |
| `SurfaceChunk` (`getBlock`, `setBlock`, `surfaceHeight`) and `SurfacePass.topMaterial` | The surface system, carvers                                                   |
| Host protocol (`init`, `run`, `cancel`, `promote`, `limit`, `destroy`; `ready`, `result`), `keepResult` and reusable-input keys | `HostedGenerationPool`, `generationHost`                              |
| Task payloads per status: structure start plans, terrain tile, packed feature patches, merged chunk parts and Bedrock sections | `chunkPipeline.ts` and the server-side adapters                         |

## Open questions

1. Whether Java 26.3 computes corners for every interpolated node over the whole lattice, or skips the noodle nodes as `range_choice` does here. The 6,125 figure assumes the former. Reading `InterpolatedFunction$Sampler.sampleVolume` and `RangeChoiceFunction$Sampler.sampleVolume` in the jar answers it.
2. How many block reads Java's `OreFeature` makes for the same blobs. A count in the jar oracle would say whether 34,356 reads per `ore_dirt` run is Java's algorithm or this server's.
3. Whether the pooled path repeats the translation climate search. Only the single-thread path was counted.
4. How the 62.7 s of CI startup splits between work and per-worker JIT warm-up. A count of tasks per worker and first-task CPU per worker on that runner would split it.

## Reproduction

```sh
uptime
pnpm exec turbo run build --filter=@jsprismarine/prismarine... --output-logs=errors-only

# The profile, single thread, full pipeline.
cd packages/prismarine
NODE_OPTIONS="--cpu-prof --cpu-prof-dir=<scratch>/prof --cpu-prof-interval=250" \
  node --conditions=jsprismarine:dist benchmarks/runExternal.mjs benchmarks/chunkGeneration.ts 0 64 full 8 2 3
node ../../.agents/skills/chrome-devtools/analyze.mjs summary <scratch>/prof/<file>.cpuprofile --top 60
node ../../.agents/skills/chrome-devtools/analyze.mjs subtree <scratch>/prof/<file>.cpuprofile buildTerrainWithSampler

# Memory and per-status worker CPU, one worker.
node --conditions=jsprismarine:dist benchmarks/runExternal.mjs benchmarks/chunkGeneration.ts 1 64 stages 8 2 3
```

The phase and kind attribution reads the `.cpuprofile` JSON. For each sample it takes the innermost frame matching a phase function (`forEachCellBlock`, `interpolatedCellMaximum` in `ChunkSampler`, `buildSurface`, `sampleBiomeCells`, `carve`, `featurePatchesFor`, `toChunk`, `partsOf`, `mergeFull`, `loadJavaWorldgenRegistries`) and classifies the leaf frame by file (`noise/PerlinNoise.js`, `density/compile.js`, `density/SampleContext.js`, `chunk/Aquifer.js`, `surface/MaterialRuleContext.js`, `biome/Climate.js`, `GenerationRegion.js` and so on), weighting each sample by its time delta.

The counts come from a script that imports the built modules by file URL and runs `node --conditions=jsprismarine:dist <script> 64` and `... 441` from `packages/prismarine`. In order, it does the following:

1. Replaces `Math.fround` with a counting wrapper before the first import, so the `f32` alias captures it.
2. Wraps prototype methods with counters: `PerlinNoise.get3` and `sampleAndLerp`, `NoiseStack.get3`, `SmearedPerlinNoise.get3`, `CornerCache.getOrCompute` (a miss is a call to its `input`), `SampleContext.interpolationCell`, `NoiseBasedAquifer.computeSubstance` and `calculatePressure`, `ChunkSampler.density` and `forEachCellBlock` (reading `cellSkipStats`), `MaterialRuleContext.updateY`, `BiomeManager.getBiome`, `ClimateParameterList.find` and `SharedClimateParameterList.find`, `GenerationRegion.blockAt`, `stateAt`, `writeSlot` and `heightAt`, and the `DataDrivenGenerator` phase methods.
3. Wraps `DensityFunctionCompiler.prototype.compile`, so every compiled closure counts calls by node type.
4. Sets the current phase on entry to each synchronous phase method, and a nested phase inside corner misses and aquifer calls.
5. Patches three build-output files for the run and restores them afterwards: `compileMaterialCondition` and `compileMaterialRule` wrap their closures with counters by node type, `lazyXZ` and `lazyY` count computations, `climateNodeDistance` counts calls, and `decorate` names the feature around each `placeFeature`.
6. Hashes the chunks the way `bench:chunks` does and checks the digest against the uninstrumented run.

```sh
# Registry sizes: entries and JSON bytes per map of loadJavaWorldgenRegistries(findJavaWorldgenSources()).
# Tile payload size: transferList byte lengths of DataDrivenGenerator.buildTerrainTile(x, 0, 1234n, [], []).

# Java 26.3's volume sampling, from the pinned jar.
unzip -q node_modules/.cache/jsprismarine/java-server/26.3/server.jar 'META-INF/versions/26.3/server-26.3.jar' -d <scratch>/jar
cd <scratch>/jar && unzip -q META-INF/versions/26.3/server-26.3.jar 'net/minecraft/world/level/levelgen/*'
javap -p -cp . net/minecraft/world/level/levelgen/densityfunction/DensitySampler.class
javap -c -p -cp . net/minecraft/world/level/levelgen/NoiseBasedChunkGenerator.class | grep -n 'sampleVolume\|computeSubstance'
```
