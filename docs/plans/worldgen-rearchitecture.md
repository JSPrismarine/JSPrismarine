# Terrain generation rearchitecture

The goal is to generate a chunk for less CPU than PumpkinMC and Bedrock Dedicated Server do, on
every runtime this server targets: Node.js today, Bun (including `bun build --compile`) and the
scriptc build. [The server benchmark](../research/benchmarks/2026-11-21/results.json) puts the
travel phase of the default-terrain scenario at 102 ms of CPU per sent column for JSPrismarine
against 15 ms for Pumpkin and 15 ms for BDS, startup at 63 s of CPU against under 2 s, and peak
memory at 2.8 GiB against 0.7 GiB. Those figures are indicative; the counts below are what the
plan holds itself to.

Written 2026-11-21 from three research notes taken the same day:

- [worldgen-cost-structure.md](../research/worldgen-cost-structure.md): where our generation CPU
  and memory go, by kind, with per-tile counts.
- [pumpkin-worldgen-architecture.md](../research/pumpkin-worldgen-architecture.md): how Pumpkin
  and Java 26.3 generate a chunk, and where our design differs.
- [worldgen-kernel-runtime-options.md](../research/worldgen-kernel-runtime-options.md): which
  kernel strategies run on Node.js, Bun and scriptc, and what each costs.

The decision this plan rests on is [ADR 0028](../adr/0028-density-functions-run-over-volumes.md).
It continues [worldgen-decoupling.md](worldgen-decoupling.md), whose slice 5 (throughput) this
plan replaces, and keeps every guarantee of [ADR 0002](../adr/0002-chunk-generation-architecture.md).

## What the research settled

1. **The gap is design, not language.** About 40% of our generation CPU is interpretation overhead
   that Java does not pay: density closure dispatch (14.3%), `GenerationRegion` block access
   through string states (11.5%), material-rule closures (7.3%), interpolation caches (3.4%) and
   garbage collection. Another 46% is work Java also does, led by the Perlin kernel (13.4%). Per
   terrain tile we make 7.15 million `Math.fround` calls and 566,000 density closure calls, where
   Java makes none of either, and the same 84,100 Perlin octave samples. (cost-structure, sections
   2 and 3.)
2. **Java 26.3 evaluates density functions over volumes.** Its `DensitySampler.sampleVolume` runs
   each node once for a whole chunk into pooled `Float32`-style buffers, evaluates everything under
   `interpolated` at the 5 by 49 by 5 cell corners only, and fills cells in `fillCell` order.
   Pumpkin ported that model (its PRs #3199, #3208, #3213) as a flat, deduplicated node array in
   topological order with a `match` per node per volume. It has no SIMD and no code generation.
   We still follow the 26.2 shape: one closure per node, called once per block. Adopting Java's
   model costs no parity argument. (pumpkin, sections 1 and 9.)
3. **The closure tree is the worst shape on every runtime, and the worst on scriptc.** A fused
   expression over a batch ran 6.5 ns per sample under scriptc, 15.6 under Bun and 22.8 under
   Node.js; the same expression as run-time-composed closures ran 63.5, 48.0 and 16.3. An
   ahead-of-time compiler cannot inline a call graph that exists only at run time. The repo's
   `f32` alias for `Math.fround` costs scriptc 5.8 times over a direct call. `eval` and
   `new Function` do not exist on scriptc. (kernel-options, sections 1 and 6.)
4. **One native strategy runs everywhere: a C library behind a C ABI**, bound through `node:ffi`,
   `bun:ffi` and scriptc's FFI, the pattern of [ADR 0006](../adr/0006-libdatachannel-for-nethernet-server.md)
   and [ADR 0023](../adr/0023-quickjs-through-one-c-layer-and-ffi.md). WebAssembly loses on
   scriptc: no SIMD, no shared memory, 58 ns per call. Both FFIs are experimental. A kernel that
   crosses the boundary once per sample is slower than TypeScript; one that crosses once per
   chunk is not. (kernel-options, sections 4 and 5.)
5. **The benchmark compares policy as well as speed.** Pumpkin runs noise out to view distance plus
   7 and makes chunks full to plus 1, so at view distance 10 one isolated player costs it 1,225 noise
   chunks for 529 full ones. We generate 2.25 terrain tiles and 1.56 feature passes per requested
   chunk in an 8 by 8 request and 1.42 and 1.20 in the 441-chunk preload. CPU per generated chunk
   is the fair comparison and nothing reports it yet. (pumpkin, section 5; cost-structure, section 4.)
6. **Startup and memory are architectural.** Every worker parses the 2.75 MiB registry set and
   builds its own pipeline (126 to 138 MB of heap and about 0.55 s of CPU each), a features task
   copies about 2.4 MB of tiles to its worker, translation searches the climate tree again for
   biomes the tile already sampled (943 searches per chunk), and the default `preload-radius` of
   10 generates 625 tiles, 529 feature passes and 441 merges before a player can join. Pumpkin
   compiles its worldgen data into the binary and starts in under a second of CPU.
   (cost-structure, section 4; pumpkin, section 6.)

## Design

Six rules. Each phase below applies them to one part of the pipeline.

1. **Evaluate by node over a batch, never by tree per sample.** A density program is a flat array
   of nodes in topological order, built from the parsed tree with structural deduplication, so a
   custom datapack's graph runs through the same interpreter as vanilla's. Each node has one
   `fill(volume, out, inputs)` that writes a `Float32Array` for a whole volume (a cell column, a
   cell or a chunk), so dispatch cost is proportional to nodes, not samples. Stateless nodes are
   shared per seed; `cache`, `interpolated` and `beardifier` state is per chunk, in pooled buffers.
2. **Round where Java rounds, through the store.** Writing a `Float32Array` rounds to single
   precision, which removes the `fround` call that today follows every operation. Where an
   intermediate must round before it is stored (the Perlin kernel's dot products, `lerp`), call
   `Math.fround` directly; a lint rule rejects the `f32` alias in hot code because scriptc turns it
   into a guarded closure call.
3. **Corners only under `interpolated`, in Java's fill order.** The 5 by 49 by 5 lattice is
   computed once per interpolated node per chunk, and cells are filled in `fillCell`'s z, x, then
   incremental y order. Our `lerp3` order must be shown bit-identical first (phase 0).
4. **Keep what we already do better than Java.** `skipProvenCells` and the cell bounds from
   `boundSampler` have no counterpart in Java or Pumpkin; they stay, applied to volumes: bound a
   cell, skip filling it, and skip a `min`/`max` operand for a whole volume when the other side
   already decides it.
5. **Data, not objects, at the seams the hot loops cross.** The terrain tile, the surface pass and
   the feature world read and write palette indices in typed arrays; strings and objects appear
   only at the Bedrock translation.
6. **The volume protocol is the kernel boundary.** A program plus a set of buffers is what a C
   kernel would take, once per chunk. Phases 1 and 2 build that protocol in TypeScript; phase 6
   moves the fill behind a C ABI only if the counts and the benchmark say TypeScript is not enough.

## Phases

Each phase is a series of small pull requests, each with a counted test that fails on the code
before it. Phases 0 to 4 are TypeScript only and run on every runtime unchanged. Phases 3, 4 and 5
are independent of one another and can run beside 1 and 2.

### Phase 0: vectors and proxies

Before any runtime changes, pin what the redesign must reproduce and give CI the counts to hold it
to.

- Capture a density-bits vector from Java 26.3's `sampleVolume` for whole chunks through the jar
  oracle (`DumpWorldgenVectors.java`), for all seven noise settings. It settles the open question
  whether our `lerp3` cell order matches `fillCell` at every block, and becomes the test every
  later phase runs. Read `InterpolatedFunction$Sampler.sampleVolume` and
  `RangeChoiceFunction$Sampler.sampleVolume` in the jar to record whether Java computes corners for
  every interpolated node (the 6,125 figure) or skips the noodle nodes.
- Add the deterministic proxies as tests in `packages/worldgen`: closure or indirect calls per block
  sample (13.4 today), positions per node dispatch (1 today), `Math.fround` calls per Perlin octave
  sample (64 today) and per tile (7.15 million), climate searches per chunk in translation (943),
  material-rule compilations per tile (1 today, per tile), region reads per feature pass (120,410).
  Check in the counting harness the cost-structure note describes so the note reproduces on its own.
- Add `chunks generated per sent column` to `tools/server-benchmark`, so the policy half of the
  comparison is visible.

### Phase 1: the density volume runtime

Replace the closure compiler as the default evaluator in `packages/worldgen/src/density`.

- A `DensityProgram`: parsed tree to flat node array, deduplicated, with each node's input indices
  and its static range (constants, `clamp`, `noise` amplitude, `range_choice` branches) as the
  existing `boundSampler` already derives it.
- A `fill` per node kind over a `Float32Array` volume. `interpolated` fills from its corner lattice;
  `cache` and y-independent subtrees fill one 16 by 16 plane and broadcast down the column;
  `min`/`max` skip the second operand over a volume the first already decides.
- Per-chunk `VolumeContext` with a buffer pool, sized to the chunk's node count, cleared and reused.
- `ChunkSampler.fill` asks for the whole chunk volume once, then walks blocks from the buffers with
  `skipProvenCells` deciding which cells to read. The aquifer and the fluid picker read from the
  buffers.
- The closure compiler stays as the test oracle (every vector runs through both until the bits match
  on the whole corpus), then leaves.

Counts the phase must reach, checked in CI: indirect calls per block sample at most 1 (the walk) for
the vanilla overworld; node dispatches per chunk at most nodes times volumes (212 times the cells
of the chunk at most, and far fewer with plane broadcast); `fround` calls outside the Perlin kernel
per tile under 100,000; output bits equal to the phase 0 vectors and the `b7740abd…c0b8` digest.

### Phase 2: noise over volumes

- `PerlinNoise.addToVolume`: for a cell column, compute the eight corner gradients once per lattice
  cell the column crosses, and broadcast one value down the column when `yScale` is 0. The octave
  stacks and smeared and normal noise sum into the volume buffer.
- The per-octave `fround` count stays at Java's arithmetic (it is the algorithm), but the dot
  products and `lerp` write through `Float32Array` where Java stores, which the phase 0 vector
  checks bit for bit.

Counts: Perlin octave samples per tile unchanged at 84,100 (any fewer is a parity bug); gradient
recomputations per octave per column at most the lattice cells the column crosses; `fround` calls
per octave sample under 40.

### Phase 3: surface, biomes and translation

- Compile a dimension's material rule once per `RandomState`, not per tile (469 compilations in a
  64-chunk run become 1). Evaluate conditions per column over the tile's typed arrays, with the
  `lazyY` cache and the local-biome box from #3404 kept.
- Carry the terrain tile's biome cells into translation so the climate tree is searched once per
  cell per chunk: 943 searches per chunk in translation become 0.
- Sample biome cells for the chunk's 4 by 4 by 96 lattice as one batch through the climate tree.

Counts: material-rule compilations per run 1 per dimension; climate searches per chunk at most the
1,536 cells less memo hits; surface blocks visited unchanged; output bits unchanged.

### Phase 4: the region as data

- `GenerationRegion` stores palette indices in typed arrays and answers `blockAt` by index; the
  feature world and surface chunk read and write indices, and resolve a state object only where a
  feature inspects properties.
- Ore features: count Java's `OreFeature` reads for the same blobs through the jar oracle. If ours
  are more, fix the algorithm; if equal, make each read cheap through the index path.

Counts: region reads per feature pass at most Java's; object allocations per feature pass counted by
a heap-sampling test and bounded; output bits unchanged.

### Phase 5: workers, startup and policy

- One parsed registry set per process, built once at install or build time into a compact binary
  snapshot (the way Pumpkin compiles its data in), loaded by every worker from one
  `SharedArrayBuffer` through the existing shared climate tables path. Registry parses per worker
  go from 1 to 0.
- Terrain tiles reach a features task as transferred or shared buffers, not structured-clone copies:
  bytes copied per features task from about 2.4 MB to 0.
- Generation policy: report chunks generated per sent column (phase 0), and set the ring the server
  generates ahead of a player as an explicit, tested number rather than a side effect of the
  dependency radii.
- Startup: the spawn region moves out of the join path. The server accepts players while the
  preload runs at `idle` priority, as Pumpkin and BDS do, or `preload-radius` gets a smaller default.
  Which of the two is a product decision this plan leaves to the owner; either is a one-line change
  once the policy count exists.

Counts: registry parses per process 1; bytes copied per features task 0; tiles per requested chunk
and per preloaded chunk as targets the policy sets.

### Phase 6, conditional: the C kernel

Decided after phases 1 and 2, on two inputs: the CI benchmark workflow's CPU per generated chunk
against Pumpkin's on the same runner (indicative), and the counts. If the Perlin kernel's
single-precision arithmetic in TypeScript is what remains between us and Pumpkin, the fill of a
density program moves behind a C ABI:

- One C library, `packages/native-worldgen`, built per platform like `packages/native-network`,
  with `-ffp-contract=off` and a bit-pattern test per expression against the phase 0 vectors.
- One call per chunk: `fill(program, seed_tables, volume) -> buffers`, with buffers registered
  once by integer handle. Bound through `node:ffi`, `bun:ffi` and scriptc's FFI, the ADR 0006 and
  0023 pattern, with the TypeScript fill from phase 1 as the fallback on a platform without a
  prebuild.
- SIMD, if used, inside the C code, where it runs on every runtime.

Counts: boundary crossings per chunk at most 1 per status; output bits unchanged.

## What "done" means

| Measure                                      | How it is checked                                                                           | Target                                                                      |
| -------------------------------------------- | ------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------- |
| Output                                       | Phase 0 vectors, the existing vector and golden tests, `chunkParity.ts`, the parity families, the bench digest | Bit-identical to Java and to today's output, on every runtime        |
| Indirect calls per block density sample      | Count test on the vanilla overworld program                                                 | At most 1 (today 13.4)                                                      |
| `fround` calls per terrain tile              | Count test                                                                                  | Under 3.5 million (today 7.15 million), all of them in the noise kernel     |
| Climate searches in translation per chunk    | Count test                                                                                  | 0 (today 943)                                                               |
| Material-rule compilations per run           | Count test                                                                                  | 1 per dimension (today 1 per tile)                                          |
| Registry parses per worker                   | Count test on the pool                                                                      | 0 (today 1)                                                                 |
| Bytes copied per features task               | Count test on the host protocol                                                             | 0 (today about 2.4 MB)                                                      |
| CPU per generated chunk against Pumpkin and BDS | `tools/server-benchmark` on the CI runner, same run, same transport, indicative            | Below both. The goal, not a CI gate                                         |
| Startup CPU on default terrain               | The same benchmark, indicative                                                              | Under 5 s with the spawn region off the join path                           |

## Risks

- **Fill order.** If `fillCell`'s order gives different bits from our `lerp3` order at some block,
  phase 1 changes output. Phase 0 finds out before any runtime changes; if they differ, the volume
  runtime adopts Java's order and the vectors move with it, since Java is the reference.
- **Custom datapacks.** The program interpreter must stay general. No phase generates code for the
  vanilla graph alone; the fused-expression speedup comes from batching, which applies to any graph.
- **Memory.** Volume buffers per chunk are a few megabytes per worker; the pool bounds them and the
  phase 5 snapshot removes far more than they add.
- **Experimental FFIs.** `node:ffi` and `bun:ffi` are experimental. Phase 6 keeps the TypeScript
  fill as the fallback and is taken only if phases 1 and 2 leave a gap worth it.
- **Shared machine.** Every timing in the notes is indicative. The counts are the evidence, and the
  benchmark workflow runs on a quiet runner.

## Order of work

Phase 0 first; nothing else starts until the vector exists. Then phase 1, with phase 3 and phase 5's
registry snapshot beside it. Phase 2 after 1. Phase 4 after 3. Phase 6 is decided, not scheduled.
Each phase lands as pull requests of one validated slice with a Changeset, as the earlier
performance rounds did.
