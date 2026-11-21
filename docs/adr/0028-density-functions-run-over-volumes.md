# Density functions run one node at a time over a volume

Status: proposed

Terrain generation costs about seven times the CPU per chunk that PumpkinMC and Bedrock Dedicated
Server spend ([benchmark, 2026-11-21](../research/benchmarks/2026-11-21/results.json)). About 40% of
that CPU is interpretation overhead Java does not pay: the density graph is compiled to one closure
per node and every block sample walks the tree, 13.4 closure calls and 36 `Math.fround` calls per
sample, 7.15 million `fround` calls per terrain tile
([worldgen-cost-structure.md](../research/worldgen-cost-structure.md)).

Java Edition 26.3 does not evaluate density functions that way. Its `DensitySampler.sampleVolume`
runs each node once for a whole chunk into pooled buffers, evaluates everything under
`interpolated` at cell corners only, and fills cells in `fillCell` order. Pumpkin ported that
model as a flat node array with one dispatch per node per volume, with no SIMD and no code
generation, and that is where its speed comes from
([pumpkin-worldgen-architecture.md](../research/pumpkin-worldgen-architecture.md)).

The server targets Node.js, Bun and the scriptc build. On all three, a run-time-composed closure
tree is the slowest shape and on scriptc it is the slowest by far, because an ahead-of-time compiler
cannot inline calls that exist only at run time. Code generated from strings does not exist on
scriptc. A fused loop over typed arrays is 3 to 10 times faster per sample than the tree on every
runtime, in TypeScript alone
([worldgen-kernel-runtime-options.md](../research/worldgen-kernel-runtime-options.md)).

## Decision

Density functions are evaluated one node at a time over a volume, as Java 26.3 does.

- A parsed density tree compiles to a flat program: nodes in topological order, deduplicated, each
  naming its inputs by index and carrying its static range. The same interpreter runs vanilla's
  graph and a custom datapack's; no code is generated for either.
- Each node fills a `Float32Array` for a whole volume in one call. Rounding to single precision
  happens through the store, and `Math.fround` is called directly only where Java rounds an
  intermediate before storing it. The `f32` alias is not used in hot code.
- `interpolated` nodes compute their corner lattice once per chunk and fill cells in Java's
  `fillCell` order. The cell bounds and cell skipping this server already has stay and apply to
  volumes.
- The per-chunk state is a pooled set of buffers; the program is shared per seed.
- The program plus its buffers is the one boundary a native kernel may sit behind, called once per
  chunk. Whether such a kernel exists is decided after the TypeScript runtime lands, on the counts
  and the benchmark. If it does, it is a C library behind a C ABI bound through `node:ffi`,
  `bun:ffi` and scriptc's FFI ([ADR 0006](0006-libdatachannel-for-nethernet-server.md),
  [ADR 0023](0023-quickjs-through-one-c-layer-and-ffi.md)), built with `-ffp-contract=off`, with the
  TypeScript fill as the fallback. WebAssembly is not that kernel: scriptc gives it no SIMD, no
  shared memory and a 58 ns call.

[ADR 0002](0002-chunk-generation-architecture.md)'s guarantees stand, in particular guarantee 5:
every operation rounds to `float` in Java's order, with no fused multiply-add and no reassociation,
proven by bit-pattern vectors rather than tolerances.

## Consequences

- The closure compiler in `packages/worldgen/src/density/compile.ts` stays only for the call sites
  where Java samples one position at a time, and goes once nothing calls it. The `generatedFunctions`
  prototype goes with it.
- Progress is measured by counts in CI (indirect calls per sample, dispatches per chunk, `fround`
  calls per tile, boundary crossings per chunk), never by timings. The plan that applies this
  decision is [worldgen-rearchitecture.md](../plans/worldgen-rearchitecture.md).
- Java's volume path and its per-block path differ in the last bits of a float (captured in
  `vectors/26.3/density-volume.json`). We reproduce the per-block path today. Terrain follows the
  volume path, so the runtime's bits move to Java's terrain bits, pinned by the `worldgen.terrain`
  parity rows, and the per-block path is kept where Java itself samples per block.
- The surface pass, the biome sampler and the feature world follow the same rule in later phases:
  typed arrays at the seams the hot loops cross, objects only at the Bedrock translation.
