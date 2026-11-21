# The density program in C

Written 2026-11-21 as the design for the step of [the terrain generation rearchitecture](worldgen-rearchitecture.md) that follows native noise. Counts in it are from master on that day and are not refreshed.

## Where terrain time goes after native noise

Native noise (#3532, #3543, #3555) moved every octave of every vanilla noise stack into C. One overworld chunk's terrain fill (seed 1234, chunk 3, -5) now runs 0 TypeScript octave samples, where it ran 78,256. What remains in TypeScript for that chunk:

- 768 interpolation cells, of which the cell walk proves 496 empty and skips them. `CellProgram` fills the other 272, so it evaluates `final_density`'s tree outside its `interpolated` nodes at 34,816 positions.
- The trees under the six `interpolated` nodes run as closure trees at cell corners, the shape [ADR 0028](../adr/0028-density-functions-run-over-volumes.md) measured at 13.4 closure calls per sample.
- 15,683 noise leaf samples, each one call into the library.
- The splines. The overworld router reaches 6 `spline` nodes with 273 spline coordinates between them, under `cache` nodes that hold one value per column.
- The aquifer, the surface pass and the biome search, which this plan does not cover.

An indicative CPU profile agrees on the order. It is a wall-clock diagnostic, not evidence: 144 overworld chunks' terrain fill with native noise, run with `node --import tsx --cpu-prof` at load average 35 to 40. Of the busy time, about 20% was the density closures in `compile.ts` (about 30% with `SampleContext` and `cellProgram.ts`), about 19% the calls into the noise library including the time spent in C, about 16% the aquifer and about 7% `ChunkSampler`.

The overworld router reaches 31 node types: `spline` (with its coordinates), `noise`, `cache`, `add`, `mul`, `abs`, `lerp`, `gradient`, `constant`, `shift_a`, `shift_b`, `range_choice`, `interpolated`, `clamp`, `blend_alpha`, `min`, `max`, `blend_offset`, `interval_select`, `quarter_negative`, `cube`, `find_top_surface`, `sub`, `div`, `squeeze`, `blend_density`, `half_negative`, `old_blended_noise`, `square` and `beardifier`.

## The shape

One compiled form, two interpreters:

- **A flat program.** A density tree compiles to an array of nodes in topological order, deduplicated as `CellProgram` deduplicates its steps. Each node has an opcode, its inputs as indices into the array, and its constants as indices into a table of doubles. A noise leaf names a native stack by index into a table of stack handles that the `RandomState` registers once. A spline is encoded into the constant table, with its coordinate as a node index.
- **A TypeScript interpreter of that program** runs the nodes over a cell's positions, one node at a time. It is the fallback where no library loads, and it is the shape scriptc compiles to fast native code ([kernel options research](../research/worldgen-kernel-runtime-options.md)), so the same work serves the scriptc build.
- **A C interpreter of the same program** is registered once per `RandomState` and called once per cell: `jwg_program_fill(program, x0, y0, z0, out)`. The call passes buffers, so it takes the slower `node:ffi` path, but there are at most 768 calls per chunk instead of tens of thousands.

Both interpreters reproduce the closures' arithmetic step by step: each `f32()` in `compile.ts` is one float operation, with no reassociation, and the C is built with `-ffp-contract=off`.

## What stays in TypeScript, and how it crosses

- **Hooks.** `beardifier`, `blend_alpha`, `blend_offset` and `blend_density` read structure and world-blender state that lives in TypeScript. They are neutral in most chunks. A cell where a hook is set runs on the TypeScript interpreter, and a counter records how often that happens.
- **`find_top_surface`** probes a column downwards. It is per-column work over its own density tree, and it moves in its own step.

## Order of landing

Each step is its own pull request, proven by the bit comparison against the closures, the `density-volume.json` vectors and the `worldgen.terrain` parity family on both paths, and measured by counts rather than timings.

1. **The flat program and its TypeScript interpreter**, with `CellProgram` replaced by it.
   - Bits: equal to the closures at every position of every cell of every vanilla setting, as `cellProgram.test.ts` checks now.
   - Counts: closure calls per filled cell outside `interpolated` nodes go to 0.
2. **The C interpreter for arithmetic and noise nodes.** The values of `interpolated`, `spline`, `cache` and hook nodes are computed in TypeScript and passed in as input buffers.
   - Counts: per filled cell, at most one library call, and 0 TypeScript arithmetic node evaluations.
3. **Splines in C**, from the constant table.
   - Counts: 0 TypeScript spline evaluations per chunk.
4. **`interpolated` corner lattices in C.** The corner values of each `interpolated` node are filled per chunk in Java's `fillCell` order, so the trees under them stop running as closures.
   - Counts: 0 closure calls per chunk outside the hook cells.
5. **`find_top_surface` and the `cache` kinds that hold one value per column.**
6. **The aquifer**, about as large in that profile as the closures, on the same program form.

## Risks

- `interval_select`, `lerp` and `gradient` are new in 26.3, and the vectors already cover them. Each needs its float order copied exactly.
- The constant table carries spline locations and derivatives as doubles, which the C has to round as the TypeScript does at each step.
- The program has to be built once per seed and shared by the threads of one process. The library's tables live in C memory, which every worker thread sees. Workers build their own program today, and the program will be built once per seed instead.
