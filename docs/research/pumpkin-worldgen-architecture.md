# How Pumpkin generates a chunk

Researched 2026-11-21. Scope: how PumpkinMC's data-driven world generator turns the vanilla
datapack into terrain, and where its design differs from Java Edition 26.3 and from this
repository's `@jsprismarine/worldgen` and `packages/prismarine/src/world/generators/datadriven`. It
covers the density function runtime, float semantics, noise, the stages after noise, threading and
memory, startup, Bedrock, and the performance work Pumpkin has published. It feeds the planned
rearchitecture of terrain generation, whose goal is to beat Pumpkin and Bedrock Dedicated Server.

Versions:

- Pumpkin `master` at `d0c0a5d73d3757258f7afb2ca240279d52653862` (2026-11-19, "fix(tester): check
  cancelled leash snap effects (#4637)"), cloned into a scratch directory and read, never built or
  run. Paths below are relative to that commit; prefix them with
  `https://github.com/Pumpkin-MC/Pumpkin/blob/d0c0a5d73d3757258f7afb2ca240279d52653862/` for a
  permalink. The benchmark in [benchmarks/2026-11-21](benchmarks/2026-11-21/results.json) ran the
  `0.2.2+26.3-26.60` release, commit `eda69440e6369c5f8a05c3f69fc809c40dab93a6`, 111 commits
  earlier. Between the two, `crates/pumpkin-world/src/generation/` changed in 12 files, mostly
  structures and the proto chunk resume path, and `crates/pumpkin-util/src/noise/perlin.rs` swapped
  `f64::floor` for `floor_to_i32` (PR #4617). Nothing in the density function runtime changed.
- Java Edition 26.3 server jar from this repository's cache
  (`node_modules/.cache/jsprismarine/java-server/26.3/server.jar`, inner
  `META-INF/versions/26.3/server-26.3.jar`), read with `javap` from Temurin 27. Pumpkin's own PRs
  name the 26.3 classes they port, and `javap` confirmed those classes exist and what they call.
- JSPrismarine at `b31164b5d01`.

Pumpkin is GPL-3.0. This note describes its design; it copies none of its code, and nothing here
should be ported line for line.

Each claim is marked as read (from source, a class file or a PR) or run (from a command in the
[reproduction](#reproduction) section). Wall-clock and CPU figures are indicative only, as
[AGENTS.md](../../AGENTS.md#measuring-performance) requires.

## Summary

- Java 26.3 itself rewrote density functions into a compiled, volume-first runtime:
  `DensityFunctionCompiler` produces `DensitySampler` objects with `sampleValue(ctx, x, y, z)` and
  `sampleVolume(ctx, buffer, volume)`, backed by `DensityVolume`, `DensityBuffer` and a
  `DensityBufferPool`, and `NoiseBasedChunkGenerator.doFill` calls `sampleVolume` once for the whole
  chunk. Pumpkin ported that model in three PRs (#3199, #3208, #3213, September 2026). Our runtime
  still follows the 26.2 shape: one closure per node, called once per block. (Read.)
- Pumpkin's density tree is a flat array of enum values in topological order, generated at build
  time from the datapack with structural deduplication. Each node reads its inputs by array index
  and dispatches with a `match`. There is no per-node virtual call, no closure and no JIT. The
  overworld `final_density` is entry 190 of a 212-entry stack. (Read.)
- Every node has a volume path. A leaf fills a buffer; an operator fills its left buffer, then a
  second pooled buffer, then combines them element by element. `interpolated` evaluates its input
  only at cell corners (a 5 by 49 by 5 corner grid for a 16 by 384 by 16 chunk) and fills each cell
  with Java's `fillCell` order: z, then x, then an incremental y step. `min` and `max` skip the
  second operand for a whole volume when every value already lies beyond its static range. (Read.)
- Pumpkin computes in native `f32` with `f64` coordinates, which is what 26.3 does, and Rust never
  fuses a multiply and add unless asked. Its parity test is not bitwise: chunk dumps from a vanilla
  server must match within 6,000 to 8,000 blocks per chunk, and its density fingerprint test only
  guards against its own regressions. (Read.)
- Noise fills volumes too. `PerlinNoise::add_to_volume` recomputes the eight corner gradients only
  when a column crosses into another lattice cell, and broadcasts one value down a column when
  `y_scale` is 0. There is no explicit SIMD; the release build uses fat LTO with one codegen unit.
  (Read.)
- Threading is a `rayon` pool of `(cpus / 2).clamp(2, 16)` threads fed by a dedicated scheduler
  thread. A stage task takes ownership of its neighborhood: the scheduler moves the (2r + 1) squared
  proto chunks out of the chunk map into the task and back. An earlier note here said the
  neighborhood is copied; the code moves it. Shared, immutable state is one `VanillaGenerator` per
  world behind an `ArcSwap`. (Read.)
- Pumpkin generates well past the view distance. A player at view distance V puts a ticket that
  makes chunks `Full` out to V + 1 and runs noise out to V + 7, so at V = 10 one isolated player
  costs 1,225 noise chunks for 529 full ones. Its CPU per sent column in our benchmark includes that
  margin. (Read.)
- Ore veins are a surface material rule in 26.3 (`minecraft:ore_vein`), not part of the noise
  stage, and Pumpkin samples `vein_toggle` once per chunk as a volume, `vein_ridged` only when a
  block passes the toggle test, and `vein_gap` per block. (Read.)
- All worldgen data is compiled into the binary. Startup builds permutation tables for one seed and
  starts the stronghold ring search in the background. In our benchmark Pumpkin started in 941 ms
  of wall time and 380 ms of CPU against our 21.8 s and 63 s. (Read and run; indicative.)
- Pumpkin's published numbers: 37.7 ms of CPU per sent chunk for vanilla 26.3 against 28.5 to 29.6
  ms for Pumpkin (PR #4401), and 20.6 to 24.0 ms of CPU per pregenerated chunk on a 6-core i7 (PR
  #4614). None records a load average. Our 2026-11-21 benchmark puts the travel phase at 102.4 ms of
  CPU per sent column for JSPrismarine against 15.2 ms for Pumpkin, a ratio of 6.7. (Read and run;
  indicative.)

## 1. The density function pipeline

### Representation

Code generation builds the tree. `tools/pumpkin-codegen/src/noise_router.rs` reads
`assets/datapack/data/minecraft/worldgen/noise_settings` and `.../density_function` (lines
2983-3005) for six presets: overworld, large biomes, amplified, nether, end and floating islands.
It hashes each node's structure and reuses the index of an identical node it has already emitted
(`unique_id` and `get_index_for_component`, lines 1555-1578), so a shared subtree such as
`continents` appears once. The output is `crates/pumpkin-data/src/generated/noise_router.rs`, 1.8
MB of Rust constants. For the overworld noise router, the stack has 212 entries; `final_density` is
index 190, `vein_toggle` 194, `vein_ridged` 208 and `vein_gap` 211 (generated file lines
6561-10722). (Read and run.)

Codegen maps every cache marker, `cache`, `flat_cache`, `cache_2d`, `cache_once` and
`cache_all_in_cell`, to one `WrapperType::Cache`, and `interpolated` to
`WrapperType::Interpolated { cell_size_xz, cell_size_y }` with the cell size from the JSON
(`noise_router.rs:2793-2817`). 26.3 replaced the older markers with a single `cache` and lets the
engine choose a cache by the axes a function depends on; PR #3195 describes the slowdown Pumpkin
saw (full chunk 48 ms to 157 ms in its bench) until codegen inferred those axes too. (Read.)

At world creation `ProtoNoiseRouters::generate_proto_stack` turns the base stack into a
`Box<[ProtoNoiseFunctionComponent]>`, building every noise sampler for the seed and computing each
node's static `min` and `max` from its inputs' ranges
(`crates/pumpkin-world/src/generation/noise/router/proto_noise_router.rs:334-788`). It builds four
independent stacks: `noise`, `surface_estimator`, `multi_noise` and `vein` (lines 255-296,
790-834). (Read.)

Per chunk, `generate_chunk_stack` builds a `Box<[ChunkNoiseFunctionComponent<'a>]>` of the same
length (`chunk_noise_router.rs:212-275`). Stateless nodes are borrowed references into the shared
proto stack (`Independent(&'a ...)`, `Dependent(&'a ...)`, lines 53-58). Only `Cache`,
`Interpolated` and `Beardifier` are owned per chunk, because they hold state. A router can be cut
short: `generate_without_veins` and `generate_aquifer` build only the prefix up to the highest index
they need (lines 320-377). (Read.)

Evaluation walks the stack by index. `sample_from_stack` splits the slice at its last element and
calls that element's `sample` with the prefix below it (`chunk_noise_router.rs:122-143`). Dispatch is
a `match` on the enum at each level (`proto_noise_router.rs:83-221`,
`chunk_noise_router.rs:82-120`). (Read.)

Two compiled alternatives exist in the tree and nothing uses them. `static_router.rs` defines a
monomorphized `StaticDensityFunction` trait over `f64`, and the generated `noise_router.rs` contains
an `overworld_compiled` module of `#[inline(always)]` functions, one per node, behind a
`NoiseEvaluationContext` trait (generated file lines 1-80). A search of `crates/` and `tools/` finds
no caller of either outside its own file and the generator that writes it. (Read and run.)

### Volume first

Every component implements `sample_volume(stack, buffer, volume)` beside `sample(stack, pos)`
(`chunk_noise_router.rs:19-51`). The default visits every position in Java's index order, and nodes
override it. `Binary` fills its left input into the output buffer, acquires a second buffer, fills
the right input, and combines the two in one loop (`density_function/math.rs:216-290`). `Slice`, the
node 26.3's `SLICE_UNIFORM_AXES` rewrite wraps around any subtree that ignores an axis, evaluates a
one-thick plane and broadcasts it (`density_function/misc.rs:428-486`); that is how a
y-independent subtree such as `continents` costs one 16 by 16 plane per chunk rather than 98,304
samples. (Read.)

`ChunkNoiseGenerator::sample_density` calls `final_density_volume` once over
`DensityVolume::with_block_step(16, height, 16, ...)`, the whole chunk
(`generation/noise/mod.rs:193-204`, `proto_chunk.rs:975-993`). `populate_noise` then walks the
buffer top down per column and asks the aquifer for each block (`proto_chunk.rs:1119-1152`). (Read.)

Buffers come from a thread-local pool of up to 1,024 boxed `f32` slices, sized up to the next
multiple of 16, with best-fit reuse up to twice the requested size and return on `Drop`
(`noise/router/density_volume.rs:6-91`). (Read.)

Java 26.3 has the same pieces. `javap` on the 26.3 jar shows `DensitySampler` with `sampleVolume`
and `sampleValue`, a `DensityVolume` record with `sizeX..stepBlockZ`, `DensityBuffer`,
`DensityBufferPool`, `DensityBufferArena`, `SamplerContext` with `CacheCell[]`,
`DensityFunctionCompiler`, `DfRewriteRule$SliceUniformAxes` and `TilingMode`.
`NoiseBasedChunkGenerator.doFill` calls `DensitySampler$Bound.sampleVolume`, and `NoiseChunk` takes
a `DensityBufferPool` from `RandomState`. Pumpkin's PRs state they port these classes. (Read.)

### `interpolated`

The node owns no corner cache. Its volume path computes which cells the requested volume touches,
builds a corner volume with a step of one cell (5 by 49 by 5 for a 16 by 384 by 16 chunk with 4 by 8
cells), samples its input over that corner volume in one call, and fills each cell
(`chunk_density_function.rs:155-223`). `fill_cell` lerps four z edges, lerps x between them, then
walks y by adding a constant `value_step` (lines 225-264). The scalar path samples the 2 by 2 by 2
corners through the volume path and returns `lerp3` (lines 279-328). Both match Java:
`InterpolatedFunction$Sampler.fillCell` calls `Mth.lerp` four times, twice more inside the x loop,
then loops `fadd` over y, and `sampleValue` reads eight corners from a 2 by 2 by 2 volume and calls
`Mth.lerp3`. (Read.)

A cell-aligned request whose step equals the cell size passes straight to the input, so the corner
grid needs no extra copy (lines 146-153, 336-341). (Read.)

### `cache`

`Cache` keeps two things: the last scalar position and value, and the last volume and its buffer
(`chunk_density_function.rs:33-114`). A second consumer asking for the same volume gets a copy of the
first buffer. Java's equivalent is `CachingDensitySampler` with a `SamplerContext.CacheCell` per
cache id. (Read.)

### Range checks instead of cell proofs

Each node carries a static `[min, max]`. `Binary::Min` skips its right operand when every left value
is below the right operand's minimum, for one sample or for a whole volume; `Max` mirrors it; `Mul`
skips when the left value, or every left value, is zero (`math.rs:160-187`, `228-246`). The
beardifier zero-fills and returns when its affected box misses the volume
(`density_function/beardifier.rs:210-228`). There is nothing like our `skipProvenCells`, which bounds
a whole interpolation cell and skips the per-block work when density cannot be positive. (Read.)

### How ours differs

`DensityFunctionCompiler.build` returns one closure per node, `(context, x, y, z) => number`
(`packages/worldgen/src/density/compile.ts:20`, `855-1029`). `ChunkSampler` calls the root closure
per block, and the opt-in volume evaluator, off by default, covers constants and arithmetic and falls
back to the scalar closure for noise, cache, interpolation and splines
(`packages/worldgen/README.md`, "Volume density prototype"; `ChunkSampler.ts:134-137`). The server
builds its sampler without `useVolumeDensity`
(`packages/prismarine/src/world/generators/datadriven/DataDrivenGenerator.ts:2522-2527`). Our
`interpolated` keeps a per-cell corner cache and an x-stage and y-stage memo in `SampleContext`
(`compile.ts:1029-1145`), and `cache` keeps one position and value per id, with a column variant for
y-independent inputs (`compile.ts:874-891`). So a node runs once per block that reaches it, where
Pumpkin and Java run each node once per volume. (Read.)

## 2. Float semantics

Pumpkin computes the density stack in `f32`. Every sampler returns `f32`
(`density_function/mod.rs:18-29`), buffers are `[f32]`, and noise coordinates stay `f64` with the
2^25 wrap before the fractional part is cast to `f32` (`crates/pumpkin-util/src/noise/perlin.rs:
64-70`, `281-294`). Gradient dot products, `smoothstep` and the lerps are `f32`
(`perlin.rs:51-60`, `crates/pumpkin-util/src/math/mod.rs:354-356`, `425-427`). PR #3213 describes
this as the 26.3 port: "Coordinates are still `f64` and keep the `2^25` wrap, while the gradient dot
products, smoothstep, and lerps run in `f32` like vanilla." Rust does not contract `a * b + c` into a
fused multiply-add unless the code calls `mul_add`, so each operation rounds once, as Java's does.
`pow` goes through `f64::powf` and casts back (`math.rs:206-212`). (Read.)

Pumpkin does not claim bit-exactness, and does not test for it against Java:

- The chunk dump tests compare against vanilla dumps in `assets/tests/` with a budget of 6,000
  mismatched blocks at the noise stage, 7,500 at surface and 8,000 at carvers
  (`generation/proto_chunk_test/dumps.rs:31`, `121`, `200`). A chunk is 98,304 blocks.
- The density fingerprint test hashes Pumpkin's own `final_density`, `vein_*` samples on a grid for
  four seeds and compares with a stored hash
  (`noise/router/parity_fingerprint_test.rs:22-53`). It catches a Pumpkin regression, not a
  difference from Java.
- The multi-noise test compares quantized climate values against a 26.3 extractor dump exactly
  (`biome/multi_noise.rs:18-54`), and PR #3213 says the `f32` port "matches it at every sampled
  point".
- PR #3213 measured seven chunks dumped from vanilla 26.3, 688,128 blocks: 4.2% differed before the
  port and 3.8% after. It names one column where `final_density` "lands within one ULP of zero at a
  cell midpoint, leaving the terrain one block higher than vanilla".

(Read.)

For us every one of those `f32` operations is a `Math.fround`. `compile.ts` has 133 `f32(` call
sites and `PerlinNoise.ts` 29 (run). Java's `fillCell` adds `value_step` in `f32` on each y step,
and Java's `doFill` reaches `fillCell`, not `lerp3`. Our `interpolated` uses the `lerp3` order (x,
then y, then z) in both its scalar path and its cell buffer (`compile.ts:1110-1143`, `1186-1226`).
Whether those two orders round to the same bits at every block was not checked here; see
[open questions](#open-questions). PR #3213 changed Pumpkin from the `lerp3` order to `fillCell`'s
and reports that almost every block difference came from another change, which suggests the orders
rarely disagree in sign. (Read.)

One consequence for a volume design in JavaScript, inferred rather than measured: storing into a
`Float32Array` rounds to `f32` on the store. For `+`, `-`, `*`, `/` and `sqrt` on two `f32` inputs,
computing in `f64` and rounding once to `f32` gives the correctly rounded `f32` result, because a
double carries more than 2p + 2 bits for p = 24, so an element loop
`out[i] = a[i] + b[i]` over `Float32Array`s gets Java's bits without a `Math.fround` call. An
accumulator such as `fillCell`'s running `value` still needs an explicit round on each step.

## 3. Noise

`PerlinNoise` is a 256-byte permutation table plus three `f64` offsets
(`crates/pumpkin-util/src/noise/perlin.rs:72-78`), shuffled at construction from the seeded random
(lines 139-158). The gradients are a `[[f32; 3]; 16]` constant (lines 9-26). Lookups mask to a byte
(`permute`, lines 160-163). There is no precomputed gradient-per-hash table and no SIMD: a search of
`pumpkin-util` and `pumpkin-world` finds no `std::simd`, `std::arch` or `core::arch`. The release
profile is `lto = true`, `codegen-units = 1` (`Cargo.toml:127-130`), with no `target-cpu`. (Read
and run.)

The volume path is where the savings are. `add_to_volume` walks z, then x, then y
(`perlin.rs:296-379`). For each column it computes the x and z hashes once, and it recomputes the
eight corners only when `floor_y` changes (`last_floor_y`, lines 354-371). `corners` precomputes the
xz part of each corner's dot product and keeps the y gradient separately, so the per-y work is eight
multiply-adds and a `lerp3` (lines 80-137, 239-277). When `y_scale` is 0 it computes one value per
column and adds it down the whole column (lines 305-340). (Read.)

`NoiseStack` is a flat list of layers, each a `PerlinNoise` with a frequency and an amplitude that
already folds in the normalization (`perlin.rs:483-531`). `NormalNoise` builds two stacks per
octave, the second at `INPUT_FACTOR` times the frequency, and concatenates them into one stack
(lines 669-739). `add_to_volume` on a stack calls each layer's `add_to_volume` with the frequency
folded into the scale, so one octave walks the whole volume before the next starts. (Read.)

`ShiftedNoise` cannot use `add_to_volume`, because each block has its own shifted coordinates. It
fills the three shift buffers as volumes, then evaluates per element and reuses the last result
while the shift triple is unchanged down a column (`density_function/noise.rs:228-268`). (Read.)

Sharing: the noise samplers live in the per-world `ProtoNoiseRouters`, built once in
`VanillaGenerator::new_with_all_settings` (`generation/generator/mod.rs:259-262`). Chunk routers
borrow them by `&'a`, so all generation threads read the same tables with no copy and no lock. Two
surface noises live in `TerrainCache` on the generator (`proto_chunk.rs:169-173`), and the surface
`MaterialRuleContext` caches the `noise_threshold` samplers it builds per chunk
(`surface/mod.rs:62-70`). (Read.)

Ours: `PerlinNoise.get3` and `get2` evaluate one point (`packages/worldgen/src/noise/PerlinNoise.ts:
24-40`); there is no volume entry point. The inner loop drops the `f32` round on gradient products,
which are exact because each gradient component is -1, 0 or 1, but keeps one on each sum
(`PerlinNoise.ts:60-110`). (Read.)

## 4. The stages after noise

### Biomes

`populate_biomes` fills the six climate parameters over the chunk's quart grid in one call,
`fill_volume` with a 4 by height/4 by 4 volume at a step of 4 blocks (`proto_chunk.rs:1053-1117`).
For a parameter that is a y slice or a constant it samples a 4 by 4 plane only
(`noise/router/multi_noise_sampler.rs:56-113`). (Read.)

The climate search is a flattened tree: `FlatNode` is 64-byte aligned with seven `i32` minima and
maxima and a child or leaf index (`crates/pumpkin-world/src/biome/mod.rs:21-42`). `search` is a
depth-first walk that prunes on squared distance and stops at distance 0 (lines 169-203). The last
result is kept per thread and per tree, returned at once for the same point and used to seed the
best distance otherwise (lines 120-167, 217-226). The overworld and nether trees are built once on
first use (`LazyLock`, lines 212-215). Our `ClimateParameterList` has the same shape, a flattened
tree with `lastResult` (`packages/worldgen/src/biome/Climate.ts:562-590`). (Read.)

### Aquifer

`WorldAquiferSampler::new` precomputes, per chunk, a grid of random source positions for every
aquifer cell the chunk touches plus one cell of margin, one positional random per cell with cells 16
by 12 by 16 blocks (`generation/noise/aquifer_sampler.rs:255-318`). Fluid levels fill in lazily
(`levels: Box<[Option<FluidLevel>]>`). It samples barrier, floodedness, spread and lava noise
through the scalar router (`get_noise_based_fluid_level`, `get_fluid_block_state`, lines 586-628),
and runs only where density is at most 0 (`apply_internal`, line 637). The sampler is stored on the
proto chunk after noise and reused by the carver stage (`proto_chunk.rs:1012`,
`carver/mod.rs:207`, `aquifer_sampler.rs:113-149`). (Read.)

### Ore veins

26.3 expresses veins as a surface material rule, `minecraft:ore_vein`
(`tools/pumpkin-codegen/src/material_rule.rs:179-180`). The noise stage builds its router without
veins (`ore_veins` is `false` at `proto_chunk.rs:989`). `build_surface` samples `vein_toggle` once
over a 16 by (y -60 to 52) by 16 volume (`proto_chunk.rs:1258-1276`). `VeinContext::get_density`
fills `vein_ridged` for that volume only when the first block passes the toggle test, and
`get_filler_gap` samples `vein_gap` per block (`surface/mod.rs:74-130`). (Read.)

### Surface rules

The surface rule is a generated `&'static MaterialRule` enum tree (`generator/mod.rs:152`), walked per
block by `try_apply_material_rule` (`surface/rule.rs:15-32`). `build_surface` runs columns top down,
skips air and liquid, and finds the stone depth below each run (`proto_chunk.rs:1283-1378`). The
preliminary surface estimate is cached per quart column in an `FxHashMap` that persists on the proto
chunk between stages (`noise/router/surface_height_sampler.rs:35-60`, `proto_chunk.rs:1000-1011`,
`1029-1040`). This is an interpreter; it compiles nothing. (Read.)

### Carvers

`carve` loops over the 17 by 17 chunks within 8 of the target, looks up the biome of each source
chunk to get its carvers, seeds a random per carver, and writes a `CarvingMask`, then fills the mask
with the aquifer from the noise stage and the surface rule for exposed tops
(`generation/carver/mod.rs:205-343`). That matches the Java behavior our Java note describes in
section 8. (Read.)

### Features

`generate_features_and_structure` collects every biome in the 3 by 3 neighborhood, then for each of
the 11 steps runs that step's structures and the globally ordered feature list for those biomes,
seeding each feature from the population seed, its global index and the step
(`proto_chunk.rs:1400-1480`). Placed features are generated statics (`PLACED_FEATURES`). PR #3195
reported, in September, that "the features stage isn't deterministic, generating the same chunk
twice gives different blocks in about half the chunks"; whether that is fixed was not checked.
(Read.)

### Structures

- Starts check the biome before assembling. The jigsaw path calls `is_valid_biome(start_pos)` after
  placing the center piece and before the `Placer` runs (`generation/structure/structures/
  jigsaw_placement.rs:664-667`); every other structure filters its candidate position
  (`generation/structure/mod.rs:57-131`). ADR 0002 measured that 91% of our candidate starts were
  assembled and then rejected by a biome check run after assembly.
- A start is computed once even when several workers ask for it: PR #4401 made each cache entry a
  `OnceLock`.
- Pieces are shared, not copied. Starts and references hold `Arc<Mutex<StructurePiecesCollector>>`,
  and the noise and feature stages iterate the same collector (`proto_chunk.rs:868-886`,
  `1482-1560`).
- Templates are NBT embedded with `include_bytes!` and parsed on first use into a `DashMap` of
  `Arc<StructureTemplate>` (`generation/structure/template/cache.rs:1-40`,
  `structure_template.rs:1497`).
- The beardifier for a chunk takes only pieces whose box comes within 12 blocks of it and junctions
  inside the same margin, and records an affected box expanded by 24 (`proto_chunk.rs:860-972`);
  its volume path skips the chunk when that box misses.

(Read.)

## 5. Threading and memory

### Pool and scheduler

`GenerationSchedule` starts a `rayon` pool of `(cpus / 2).clamp(2, 16)` threads named
`ChunkGen-<i>` and allows `2 * gen_threads` generation tasks in flight
(`crates/pumpkin-world/src/chunk_system/schedule.rs:145-154`). A dedicated `Schedule` thread owns a
DAG of (chunk, stage) nodes and a `BinaryHeap` of ready tasks (lines 156-180), and spawns each task
onto the pool (lines 1615-1620). I/O runs on Tokio tasks (lines 131-142). The root `AGENTS.md` says
"CPU-heavy work such as chunk generation and lighting runs on Rayon." (Read.)

### Stages and neighbors

Stages are `Empty`, `Biomes`, `StructureStart`, `StructureReferences`, `Noise`, `Surface`,
`Carvers`, `Features`, `Lighting`, `Spawn`, `Full` (`chunk_system/chunk_state.rs:22-45`). That is
26.2's split of terrain into noise, surface and carvers, with biomes ahead of structure starts.
Direct dependencies: `StructureReferences` needs `StructureStart` out to radius 8, `Surface` needs
`Noise` and neighbor `Biomes` at radius 1, and `Features`, `Lighting`, `Spawn` and `Full` need the
previous stage at radius 1 (lines 158-190). Only `Features`, `Lighting` and `Spawn` write into
neighbors (lines 150-156). (Read.)

When a task is ready, the scheduler builds a `Cache` and moves each chunk of the write neighborhood
out of the chunk map into it with `swap`, marking the holders occupied in the DAG so no overlapping
task can run (`schedule.rs:1519-1600`). The task gets the chunks by value and sends the cache back
when done (`chunk_system/worker_logic.rs:271-295`). `Surface` gets a separate copy of its eight
neighbors' biome arrays (`schedule.rs:1524-1544`, `generation_cache.rs:28-75`). (Read.)

Java, as [java-chunk-generation-pipeline.md](java-chunk-generation-pipeline.md) records, runs only
`biomes` and `terrain` in parallel and every other status, including `features`, on one serial
executor. Pumpkin runs every stage on the pool and gets exclusivity for `features` from the DAG's
occupancy instead. We run the whole ladder in workers and merge feature writes as patches
([ADR 0002](../adr/0002-chunk-generation-architecture.md)). (Read.)

### How far ahead

A player's view puts a ticket at `FULL_CHUNK_LEVEL - (view_distance + 1)` with `FULL_CHUNK_LEVEL =
43` (`crates/pumpkin-core/src/world/chunker.rs:97-101`, `chunk_system/chunk_loading.rs:21`,
`106-108`). Level rises by one per ring, and `level_to_stage` maps 43 to `Full`, 44 `Spawn`, 45
`Lighting`, 46 `Features`, 47 `Carvers` and 48 `Surface` (`chunk_state.rs:103-121`). At view
distance V a player therefore gets `Full` to V + 1, `Surface` to V + 6, `Noise` and `Biomes` to
V + 7, and structure starts to V + 15. At V = 10, the benchmark's setting, that is 23 squared = 529
full chunks and 35 squared = 1,225 noise chunks for one player alone. (Read; the counts are
arithmetic.)

That margin matters when reading the benchmark: CPU per sent column charges Pumpkin for noise it ran
on chunks it never sent. How far ahead our server generates was not compared here.

### Shared and per-chunk state

Shared, immutable, per world: `Level.world_gen: ArcSwap<WorldGenerator>`
(`crates/pumpkin-world/src/level.rs:92`) holding `VanillaGenerator`, whose `ProtoNoiseRouters`,
`TerrainCache`, `&'static` settings and surface rule, and structure caches every thread reads
(`generator/mod.rs:147-166`). Generated data (blocks, biomes, placed features, the biome trees) is
`static`. (Read.)

Per chunk, estimated from the types rather than measured:

| Item | Size |
| --- | --- |
| `final_density` output, 16 by 384 by 16 `f32` | 393,216 bytes |
| Each full-volume intermediate buffer an operator above `interpolated` acquires | 393,216 bytes |
| `interpolated` corner grid, 5 by 49 by 5 `f32` per node | 4,900 bytes |
| `vein_toggle`, `vein_ridged`, 16 by 112 by 16 `f32` | 114,688 bytes each |
| Proto chunk blocks, `u16` per block, allocated up to the highest non-air section (PR #3710) | up to 196,608 bytes |
| Chunk router, one enum entry per stack entry | 212 entries |

So a noise task touches on the order of 1 to 2 MB, most of it pooled buffers that a thread reuses.
(Read; estimate.)

## 6. Startup

Pumpkin compiles vanilla data in. `tools/pumpkin-codegen` reads `assets/` and writes committed Rust
into `crates/pumpkin-data/src/generated/`, which includes `noise_router.rs`, `material_rule.rs`,
`placed_feature.rs`, `configured_feature.rs`, `structure_template.rs`, `biome.rs` and `carver.rs`
(run: directory listing). The vanilla datapack is downloaded by `pumpkin-data`'s build script when
missing (`tools/pumpkin-codegen/src/main.rs:136-148`). The generator reads `&'static` settings and
the generated router constants, so a runtime datapack cannot change density functions or noise
settings. The earlier note [prior-art-data-driven-servers.md](prior-art-data-driven-servers.md)
lists what Pumpkin's runtime datapack loader does handle: recipes, functions, loot tables,
structures, template pools and processor lists. (Read.)

Creating a world builds `GlobalRandomConfig`, the `TerrainCache` noises and every noise sampler in
the four router stacks, filters structure sets to the biomes the dimension can produce, and starts
the stronghold ring search in the background (`generator/mod.rs:230-330`; PR #3764 for the
background search). (Read.)

Indicative, from our 2026-11-21 benchmark's terrain scenario (median of five runs): Pumpkin reached
its ready line in 941 ms with 380 ms of CPU; JSPrismarine over NetherNet took 21,827 ms and 63,180
ms of CPU; BDS 3,715 ms and 1,280 ms. The runs were on a 4-vCPU GitHub runner with one-minute load
averages between 0.17 and 2.43 before and after each run. These figures do not separate worldgen
setup from the rest of startup. (Run.)

## 7. Bedrock

Pumpkin's README lists "Bedrock Edition (W.I.P)". `crates/pumpkin-world/src/lib.rs:36-37` pins
Bedrock 1.26.63, protocol 2225. Generation has no Bedrock branch: Bedrock players get the same Java
terrain, translated at encode time. `CLevelChunk` writes each sub-chunk's palette through
`convert_be_network` and a second water layer for waterlogged states
(`crates/pumpkin-core/src/net/bedrock/level_chunk.rs:99-125`,
`crates/pumpkin-world/src/chunk/palette.rs:678`, `782-830`, `890-946`). Commit `d111a660` stopped
sending all-air sub-chunks to Bedrock clients. That is the same position as ours: Java generation,
Bedrock on the wire. (Read.)

## 8. Published performance work

`crates/pumpkin-world/AGENTS.md` calls chunk generation "the hottest path in the server" and asks
for Criterion results from `benches/` on master and the branch in every PR that touches it. The
benches are `chunk_gen.rs` (seed 42, one benchmark per stage plus `full_chunk_generation`),
`chunk_gen_concurrent.rs`, `noise_router.rs`, `jigsaw.rs`, `template_pool.rs`, `chunk.rs` and
`chunk_io.rs`. (Read.)

Figures the PRs claim, quoted as written. None names a load average, so all are indicative.

| PR | Merged | Claim |
| --- | --- | --- |
| [#2847](https://github.com/Pumpkin-MC/Pumpkin/pull/2847) | 2026-08-09 | "improve chunk generation speed ~1.27x": density fill cache, aquifer skip sampling |
| [#3195](https://github.com/Pumpkin-MC/Pumpkin/pull/3195) | 2026-09-02 | 26.3 cache markers by domain axes: full chunk 157 ms to 40.6 ms, biomes 13.8 ms to 1.09 ms |
| [#3199](https://github.com/Pumpkin-MC/Pumpkin/pull/3199) | 2026-09-03 | `DensityVolume`, pooled `DensityBuffer`, slice rewrite: full chunk 40.3 ms to 41.4 ms (cost of the extra slice nodes before volumes) |
| [#3208](https://github.com/Pumpkin-MC/Pumpkin/pull/3208) | 2026-09-03 | volume density sampler: full chunk 40.6 ms to 28.8 ms, noise 12.7 ms to 9.6 ms, carvers 4.3 ms to 1.4 ms |
| [#3213](https://github.com/Pumpkin-MC/Pumpkin/pull/3213) | 2026-09-03 | 26.3 Perlin with `add_to_volume`: full chunk 40.29 ms to 24.05 ms, noise 12.92 ms to 6.63 ms |
| [#4401](https://github.com/Pumpkin-MC/Pumpkin/pull/4401) | 2026-10-29 | one bot flying 64 blocks/s, CPU per sent chunk: vanilla 26.3 37.7 ms, Pumpkin master 38.4 to 42.8 ms, PR 28.5 to 29.6 ms |
| [#4614](https://github.com/Pumpkin-MC/Pumpkin/pull/4614), split into #4617, #4618, #4621 | 2026-11-18 | pregen of 4,096 chunks on an i7-8700B: CPU per chunk 22.67 to 20.55 ms (256 concurrent), 31.18 to 23.95 ms (16 concurrent) |

Issue [#2854](https://github.com/Pumpkin-MC/Pumpkin/issues/2854) has a user's pregen comparison on a
72-core Xeon with a 26.2-era build (`92658f5`, before the volume port): 284 ms of CPU per chunk for
Pumpkin against 50 ms for Fabric with C2ME and Chunky. Pumpkin's later PRs cite it as the profile
they worked from. (Read.)

Our own benchmark, the travel phase of the terrain scenario (three bots, view distance 10, median of
five runs): JSPrismarine over NetherNet spent 102.4 ms of CPU per sent column, over RakNet 105.6 ms,
Pumpkin 15.2 ms and BDS 14.4 ms. The join phase reads 16.7, 16.8, 6.8 and 6.8 ms. Command and load
averages are in [the reproduction section](#reproduction) and in `results.json`. (Run; indicative.)

## 9. Stage by stage

| Stage | Java 26.3 | Pumpkin | JSPrismarine |
| --- | --- | --- | --- |
| Density representation | `DensityFunctionCompiler` turns the tree into `DensitySampler` objects after rewrite rules (`DfRewriteRule$SliceUniformAxes`) | Codegen flattens the datapack tree into a deduplicated enum array; per-chunk router borrows stateless nodes, owns `Cache`, `Interpolated`, `Beardifier` | One closure per node, memoized by tree identity (`compile.ts:449-475`); optional generated functions, off by default |
| Evaluation unit | `sampleVolume` over a `DensityVolume`; `doFill` samples the whole chunk once | `sample_volume` per node over the chunk volume, pooled `f32` buffers | Per block, scalar; volume evaluator is opt-in and partial |
| `interpolated` | Corner volume, then `fillCell` in z, x, incremental y order; scalar path `lerp3` | Same as Java | Corner cache per cell, `lerp3` order (x, y, z) with x and y stage memos |
| `cache` | One `cache` marker; `CachingDensitySampler` and `SamplerContext.CacheCell` | One scalar memo plus one volume memo per node | One position memo per id, plus a column memo for y-independent inputs |
| y-independent work | `SLICE_UNIFORM_AXES` rewrite | Same rewrite in codegen; `Slice` evaluates a plane and broadcasts | Column memo inside `cache` |
| Skipping work | Not read | Static node ranges skip `min`, `max`, `mul` operands per sample or per volume | Interval bounds prove whole cells non-positive (`skipProvenCells`), plus range checks |
| Float | `f32` values, `f64` coordinates | Native `f32`, `f64` coordinates; tolerance-based parity | `f64` with `Math.fround` after each step; bitwise parity vectors |
| Perlin | `PerlinNoise.addToVolume` | `add_to_volume`, corners recomputed on lattice change, column broadcast when `y_scale` is 0 | `get3` per point |
| Biomes | `createResolverForChunk`, R-tree with `lastResult` | Six-parameter volume over the quart grid; flat 64-byte tree nodes, thread-local last leaf | Flattened climate tree with `lastResult` |
| Aquifer | `Aquifer.NoiseBasedAquifer` | Eager per-chunk grid of random positions, lazy fluid levels, scalar noise; reused by carvers | `Aquifer.ts`, per block where density allows |
| Ore veins | `ore_vein` material rule | Toggle as one volume per chunk, ridged on demand, gap per block | `oreVein.ts` within the surface rules (`MaterialRule.ts`) |
| Surface rules | Material rule objects | Generated static enum tree, interpreted per block | `MaterialRule.ts`, interpreted |
| Carvers | `CarvingMask`, then `applyCarvingMask` from the aquifer | Same, over a 17 by 17 source neighborhood | `carveColumn.ts`, carving mask filled from the aquifer |
| Features | One serial `ConsecutiveExecutor`, writes into neighbors | Parallel task with exclusive ownership of the 3 by 3 neighborhood | Parallel; neighbor writes become patches merged in a fixed order |
| Structures | Biome check before assembly | Biome check before assembly; `OnceLock` per start; pieces shared by `Arc` | ADR 0002 measured assembly before the biome check; current state not rechecked here |
| Threads | `ForkJoinPool` of cores - 1 for `biomes` and `terrain` | `rayon` pool of cores / 2, clamped 2 to 16 | Worker pool of cores - 1 in a generation host process (`chunkConcurrency.ts:18`, ADR 0005) |
| Data | Datapack read at runtime | Compiled into the binary at build time | Datapack read at startup |

Java column: read from the 26.3 jar with `javap` where named, otherwise from
[java-chunk-generation-pipeline.md](java-chunk-generation-pipeline.md). JSPrismarine column: read
from this repository at `b31164b5d01`.

## What this means for the rearchitecture

These follow from the findings; none is measured.

- Pumpkin's speed does not come from Rust tricks. It has no SIMD, no runtime code generation, and
  it ignores its own compiled-function module. It comes from running each density node once per
  volume, evaluating everything under `interpolated` at cell corners only, and keeping noise setup
  out of the inner loop. That design is Java 26.3's, so it costs us no parity argument to adopt it.
- Per-block closure calls are what Java and Pumpkin removed. A volume runtime over `Float32Array`
  buffers would also remove most `Math.fround` calls, since the store rounds.
- Generating noise seven rings past the view distance is a policy, not a cost of the algorithm. A
  rearchitecture can beat Pumpkin on CPU per sent column partly by generating less ahead of the
  player, but CPU per generated chunk is the fair comparison and the benchmark does not report it.
- Our `skipProvenCells` has no counterpart in Pumpkin or Java. It still applies in a volume design:
  bound a cell, skip filling it.

## Open questions

- Does our `lerp3`-order cell interpolation produce the same `f32` bits as Java's `fillCell`, which
  `doFill` uses, at every block? A density-bits vector captured from Java's `sampleVolume` would
  settle it. Pumpkin's PR #3213 suggests the orders rarely change a block, which is not the same as
  never.
- How many chunks does our server generate per sent column at view distance 10, against Pumpkin's
  2.3 noise chunks per full chunk for an isolated player? Without it, CPU per sent column compares
  two policies as well as two generators.
- Is Pumpkin's features stage deterministic now? PR #3195 said it was not, in September.
- What does Java 26.3's `DensityBufferPool` do on release and between chunks? Pumpkin keeps up to
  1,024 buffers per thread with no aging; PR #3199 says vanilla uses age-based collection.

## Reproduction

```sh
# Pumpkin source, read only
SCRATCH=/private/tmp/claude-501/-Users-filiphsandstrom--t3-worktrees-JSPrismarine-perf-optimize-gameplay--ea7dbaba1cb1349f/7c11c70a-e6b6-4c08-9f7b-50c73e9bfa3f/scratchpad
mkdir -p "$SCRATCH/pumpkin-src"
git clone --filter=blob:none https://github.com/Pumpkin-MC/Pumpkin.git "$SCRATCH/pumpkin-src"
cd "$SCRATCH/pumpkin-src"
git log -1 --format='%H %cd %s'          # d0c0a5d7..., 2026-11-19
git rev-list --count eda69440e6369c5f8a05c3f69fc809c40dab93a6..HEAD    # 111
git diff --stat eda69440e6369c5f8a05c3f69fc809c40dab93a6 HEAD -- crates/pumpkin-world crates/pumpkin-util
for c in 729ddb50 cff959c4 e7fd45c0 83efbd3a eba538f2 c7d4c08d; do
  git merge-base --is-ancestor $c eda69440e6369c5f8a05c3f69fc809c40dab93a6 && echo "$c in" || echo "$c after"
done

# Files read
cat -n crates/pumpkin-world/src/generation/noise/router/{proto_noise_router,chunk_noise_router,chunk_density_function,density_volume,static_router,multi_noise_sampler,surface_height_sampler,parity_fingerprint_test}.rs
cat -n crates/pumpkin-world/src/generation/noise/router/density_function/{mod,math,misc,noise,beardifier}.rs
cat -n crates/pumpkin-util/src/noise/perlin.rs crates/pumpkin-world/src/generation/noise/{mod,aquifer_sampler}.rs
cat -n crates/pumpkin-world/src/generation/{proto_chunk.rs,carver/mod.rs,surface/mod.rs,surface/rule.rs}
cat -n crates/pumpkin-world/src/biome/{mod,multi_noise}.rs
cat -n crates/pumpkin-world/src/chunk_system/{schedule,chunk_state,chunk_loading,generation_cache,worker_logic}.rs
sed -n 80,122p crates/pumpkin-core/src/world/chunker.rs
sed -n 1550,1580p tools/pumpkin-codegen/src/noise_router.rs
sed -n 2785,2830p tools/pumpkin-codegen/src/noise_router.rs
sed -n 2975,3010p tools/pumpkin-codegen/src/noise_router.rs
grep -n "full_component_stack: &\[\|final_density: \|vein_gap: " crates/pumpkin-data/src/generated/noise_router.rs | head
grep -rl "overworld_compiled\|NoiseEvaluationContext" crates tools
grep -rn "StaticDensityFunction" crates tools
grep -rln "std::simd\|std::arch\|core::arch" crates/pumpkin-util crates/pumpkin-world
grep -n "allowed_mismatches" crates/pumpkin-world/src/generation/proto_chunk_test/dumps.rs

# PR and issue text
for n in 2847 3195 3199 3208 3213 4401 4614 4617 4618 4621; do
  gh pr view $n -R Pumpkin-MC/Pumpkin --json title,body,mergedAt
done
gh issue view 2854 -R Pumpkin-MC/Pumpkin --json title,body
gh api repos/Pumpkin-MC/Pumpkin/issues/2854/comments
git log --format='%h %ad %s' --date=short | grep -i -E 'perf|density|noise|worldgen|generation'

# Java 26.3, from this repository's cache, read with javap
J=/Library/Java/JavaVirtualMachines/temurin-27.jdk/Contents/Home/bin/javap
mkdir -p "$SCRATCH/java263" && cd "$SCRATCH/java263"
unzip -o -q <repo>/node_modules/.cache/jsprismarine/java-server/26.3/server.jar 'META-INF/versions/*'
JAR=META-INF/versions/26.3/server-26.3.jar
unzip -l $JAR | grep 'levelgen/densityfunction/'
$J -p -cp $JAR net.minecraft.world.level.levelgen.densityfunction.DensitySampler \
  net.minecraft.world.level.levelgen.densityfunction.DensityVolume \
  'net.minecraft.world.level.levelgen.densityfunction.op.InterpolatedFunction$Sampler' \
  net.minecraft.world.level.levelgen.densityfunction.CachingDensitySampler \
  net.minecraft.world.level.levelgen.densityfunction.SamplerContext \
  net.minecraft.world.level.levelgen.densityfunction.DensityFunctionCompiler \
  net.minecraft.world.level.levelgen.synth.PerlinNoise
$J -c -p -cp $JAR 'net.minecraft.world.level.levelgen.densityfunction.op.InterpolatedFunction$Sampler' \
  | awk '/void fillCell/,/^$/'
$J -c -p -cp $JAR net.minecraft.world.level.levelgen.NoiseBasedChunkGenerator | grep -n 'sampleVolume\|sampleValue'

# This repository
git grep -c "f32(" -- 'packages/worldgen/src/*.ts' ':!*.test.ts'
git grep -n "new ChunkSampler(" -- packages | grep -v '\.test\.'

# Benchmark medians, CPU per sent column by phase (terrain scenario)
python3 -I - <<'EOF'
import json, statistics as st
d = json.load(open('docs/research/benchmarks/2026-11-21/results.json'))
for s in ['jsprismarine-nethernet', 'jsprismarine-raknet', 'pumpkin', 'bds']:
    rs = [r for r in d['runs'] if r['server'] == s and r['scenario'] == 'terrain' and r['ok']]
    for ph in ['join', 'travel']:
        v = [r['phases'][ph]['cpuMs'] / r['phases'][ph]['columns'] for r in rs if r['phases'][ph]['columns']]
        print(s, ph, round(st.median(v), 2))
    print(s, 'startup', st.median([r['startupMs'] for r in rs]), st.median([r['startupCpuMs'] for r in rs]))
load = [x for r in d['runs'] if r['scenario'] == 'terrain' for x in (r['load']['before'][0], r['load']['after'][0])]
print('load', min(load), max(load))
EOF
```

The benchmark itself ran as `node tools/server-benchmark/src/run.mts --rounds 5` on GitHub Actions
run [44861900311](https://github.com/JSPrismarine/JSPrismarine/actions/runs/44861900311), an AMD EPYC
9V45 runner with 4 logical CPUs; `results.json` records the per-run load averages.
