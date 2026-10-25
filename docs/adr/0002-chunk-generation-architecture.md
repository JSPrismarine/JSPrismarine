# Generate a chunk through a status ladder, not a 3 by 3 region

Status: accepted

`DataDrivenGenerator.generateChunk` builds a 3 by 3 region, generates terrain for nine chunks,
decorates the centre, extracts one chunk and serializes the whole body behind one promise, at
1572 ms per chunk. We replace it with Java's model: a chunk exists at a named status, a holder
owns one promise per status, a step table declares what each status may read and write, and a
scheduler advances statuses in layers. Every status becomes a pure function of the world seed,
the chunk position and the frozen outputs of the statuses below it, which is what lets a worker
pool run them and what makes the output independent of generation order and worker count.

The implementation is sliced in
[docs/plans/chunk-generation-rewrite.md](../plans/chunk-generation-rewrite.md).

## What we build

Six parts, in the order they depend on each other.

**A status ladder.** All ten of Java's statuses with Java's indices and parents: `empty`,
`structure_starts`, `structure_references`, `biomes`, `terrain`, `features`, `initialize_light`,
`light`, `spawn`, `full`. The three in the middle carry pass-through bodies for now, because
lighting lives in `packages/lighting`, spawning in `packages/spawning`, and neither is sequenced
against generation today. Keeping them in the ladder rather than collapsing it costs one ring of
accumulated radius and buys an exact match with Java's dependency tables, so the step table is a
transcription rather than a derivation, and attaching lighting later is wiring a body rather than
reshaping the pyramid.

**A step table.** Per status, the status each neighbour at Chebyshev distance d is guaranteed to
have reached, and the radius the status may write blocks into. The numbers are Java's, read out of
`ChunkPyramid.GENERATION_PYRAMID`
([java-chunk-generation-pipeline.md](../research/java-chunk-generation-pipeline.md) section 2).
`terrain` writes radius 0; `features` writes radius 1; everything else writes nowhere.

**A holder per chunk.** One promise per status. The first caller to ask for a status creates the
promise, every later caller awaits the same one. That is Java's `acquireStatusBump` without the
compare-and-exchange, because the Node event loop makes the map insert atomic. The invariant that
a (chunk, status) body runs exactly once is therefore free, and it holds whether the body runs
inline or in a worker, because only the owning thread touches the holder.

**A proto chunk.** The intermediate state a neighbour can be handed partway through: a block
palette and a `Uint16Array` of indices, the four heightmaps, the biome palette, and the block
entity and entity spawn requests. Flat typed arrays throughout, so the whole thing moves between
threads in a transfer list for 18 microseconds rather than being cloned.

**A feature patch, merged in a fixed order.** A chunk's feature pass reads its own live proto
chunk and the `terrain`-status snapshot of its eight neighbours, and every write that lands
outside its own chunk is recorded as a patch rather than applied to the neighbour. A chunk's
final blocks are its terrain, then its own feature writes, then the eight inbound patches applied
in a fixed neighbour order. A chunk may only reach `full` once it and all eight neighbours have
passed `features`, which is Java's rule and is what makes a tree whole across a border.

**A worker pool.** piscina, six workers, each holding one seed's compiled pipeline, fed the
registry documents as one `SharedArrayBuffer` of UTF-8 JSON. Workers run status bodies and return
transferable proto chunks. The main thread owns the holders, the scheduler, the patch merge and
the translation from Java states to Bedrock runtime ids.

## Why the current shape costs 1572 ms

Measured at `07581ce57a`, before the four correctness fixes that landed after it, so these are the
last numbers taken end to end ([worldgen-defects.md](../research/worldgen-defects.md) section 6).

| Stage | ms | Share |
| --- | --- | --- |
| Structures: starts laid out against the noise, plus piece placement | 875 | 56% |
| Terrain for the 3 by 3 window | 681 | 43% |
| of which the chunk's own tile | 227 | 14% |
| of which the two neighbouring columns | 454 | 29% |
| Feature decoration | 16 | 1% |
| Carvers | 0 | 0% |

The 454 ms is the 3 by 3 window, and it is work the design does nine times. `generateChunk`
builds nine independent radius-0 terrain regions and merges their centres into one radius-1 region
with `copyCenterFrom` (`DataDrivenGenerator.ts:236`). Walking along a row, each new chunk needs
three new tiles. The `terrainChunks` cache holds 128 of them and then evicts, so a preload at
`preload-radius: 5` is 121 chunks and sits right at the edge.

The 875 ms is not what it looks like, and the second measurement pass changed this decision. It
is not duplicated work, it is not a cache miss, and it is not noise evaluation. The start cache
already works: `startsFor` is called four times per chunk in steady state rather than ten, and
essentially every `startAt` inside those calls hits the cache. What the 875 ms is, measured over a
40-chunk walk at seed 1234, is first-time jigsaw assembly of candidate starts, at 0.83 new
layouts per chunk costing about 375 ms each.

Two numbers from that pass matter more than the 875 itself.

**91% of candidates are assembled and then thrown away.** Over a 102 by 102 chunk area, 256
candidate starts were laid out and 234 were rejected, and those 234 consumed 87% of all layout
time. The rejection is `javaStructureStarts.ts:225`, the biome check at the generation point,
which runs after the builder at `:213` has fully assembled the structure. A rejected village costs
3083 ms, a rejected trial chamber 2145 ms, a rejected desert pyramid 796 ms. The cost is jigsaw
assembly, not terrain sampling: `jigsawBlocksOf` in `packages/structures/src/jigsaw.ts:329` is
20.9% self time on its own, rescanning every block of a template inside a loop over parent
jigsaws, candidate elements and rotations, with no cache.

**875 ms per chunk is a 1-D artifact, not a steady-state constant.** Layout arrives in bursts, one
per candidate entering the window, so the eight-chunk sample that produced 875 happened to cross a
couple of jigsaw candidates. The same walk over 40 chunks reads 311 ms per chunk. Filling a 102 by
102 area reads 9.4 ms per chunk, because a 1-D front drags 19 fresh chunks into the window at
every step where a 2-D fill drags one. Java pays the same total, since its radius-8
`structure_references` requires that neighbourhood to have reached `structure_starts` too.

The structure-level column sampling is badly shaped and is not the bottleneck. One
`StructureLevel.baseHeight` call samples an entire 384-block column top to bottom with aquifers on
and materializes it as a 384-entry array (`javaStructureLevel.ts:64`), where Java's
`getBaseHeight` walks cells downward with aquifers off and stops at the first match. A desert
pyramid asks for 441 columns, a shipwreck 253, a village 180. Measured, that is about 50 column
misses per chunk, 6% of the chunk's density samples and 16% of layout wall time. Worth fixing,
not worth leading with.

A CPU profile of the terrain pass agrees about where its own time goes: 55% of samples are inside
density function and Perlin noise evaluation in `@jsprismarine/worldgen`, with `gradDot` at 16.1%
and `sampleAndLerp` at 11.4%.

One structure cost is not in the structure code at all. `createBeardifier`
(`DataDrivenGenerator.ts:327`) is the right operand of the top-level add in the overworld's
`final_density`, so once it is installed every density sample runs it, and the closure at
`javaStructureBeard.ts:108` loops over every nearby piece. Measured at 98304 calls, which is one
chunk, it costs 0.5 ms with no pieces, 32.5 ms with 40, 125 ms with 76 under `beard_thin` and 220
ms with 76 under `encapsulate`, which is what an ancient city asks for. Today that is paid once
per terrain tile and a chunk builds three new tiles in steady state, so a chunk inside an ancient
city's beard spends roughly 660 ms there. A structures-on and structures-off measurement charges
that to structures; it is spent inside `buildTerrain`.

A warning about all of these numbers. The end-to-end ladder in
[worldgen-defects.md](../research/worldgen-defects.md) section 6 was taken on a host under heavy
load, and a repeat attempt read the same chunk at 1064 ms, 8347 ms and 21435 ms. The
microbenchmarks and the counts above are sound because they are relative and in-process. The
wall-clock totals are not, and they should be retaken on an idle machine before anyone optimizes
against them.

## What each stage buys

The target is 50 to 100 chunks per second on an Apple M1 Pro, 6 performance cores plus 2
efficiency cores. Worker scaling on that machine peaks at 4.7 times one thread at five or six
workers, confirmed twice: a synthetic Perlin kernel peaked at 4.67 to 4.84 and real deepslate
chunk generation at 4.4
([parallel-chunk-generation-in-node.md](../research/parallel-chunk-generation-in-node.md)
section 6). So 50 chunks/s is 20 ms aggregate per chunk and 94 ms per chunk per worker, and 100
chunks/s is 10 ms aggregate and 47 ms per worker.

Two cost models, because structure layout differs by a factor of 33 between them. A **fill** is a
square region generated at once, which is what a preload does. A **front** is a player walking in
one direction, where every step drags a fresh column of chunks into the structure window.

| Stage | Fill, ms/chunk | Front, ms/chunk | Fill chunks/s at 4.7x | Front chunks/s at 4.7x |
| --- | --- | --- | --- | --- |
| Today | 1572 | 1572 | 0.6, one thread | 0.6, one thread |
| The ladder | about 250 | about 550 | 4.0, one thread | 1.8, one thread |
| Plus rejecting a structure before assembling it | about 243 | about 283 | 4.1, one thread | 3.5, one thread |
| Plus the pool | about 243 | about 283 | 19 | 17 |
| Plus a faster terrain fill, 2.5x | about 112 | about 152 | 42 | 31 |
| Plus a WebAssembly terrain kernel | about 50 | about 90 | 93 | 52 |

The last two rows do not stack. A WebAssembly fill replaces the JavaScript one, so its row is 6.4
times against the original 227 ms rather than against the 2.5 times row above it.

Read the rows as follows.

**The ladder buys 3 to 6 times, and it is not optional.** It removes the 454 ms of duplicate
neighbour terrain outright, because each chunk's terrain is computed once into its holder and read
by up to nine feature passes. It computes each chunk's structure reference set once rather than
the four times `startsFor` is called for it today, which is worth about 8 ms. It does not make one
terrain tile or one structure layout any faster, and it does not reduce the total structure layout
work at all; it only moves when that work is paid, which is also true of Java. What the ladder is
really for is correctness and parallelism. It is the only shape in which every status is a pure
function, which is the precondition for everything below it.

**Rejecting a structure before assembling it is the whole structure problem.** 234 of 256
candidates were assembled and then discarded by the biome check at
`javaStructureStarts.ts:225`, consuming 87% of all layout time. Moving the check in front of the
builder takes the front model from 310 ms per chunk of layout to about 40, and the fill model from
9.4 to about 1.2. It is also the only item in this decision that deviates from Java's order, since
Java filters after `findGenerationPoint` too, so it needs a parity ruling rather than just an
implementation. Memoizing `jigsawBlocksOf`, which is 20.9% self time with no cache, is the same
saving taken from the other side and needs no ruling at all.

**The pool buys 4.7 times and no more.** That is measured, twice, on this machine, and it is a
property of six performance cores and V8 isolates rather than of this code. More workers past six
made it worse. It is also the point at which terrain becomes roughly 90% of the per-chunk cost and
everything else stops mattering.

**The terrain fill is 227 ms for 98304 blocks, 2.3 microseconds per block, and after the two rows
above it is the whole remaining problem.** The density stack is already in good shape:
`density/compile.ts` compiles the function graph to closures, and `SampleContext.CornerCache` is a
flat direct-mapped `Float64Array` lattice rather than deepslate's template-string `Map`, which is
worth 36 times on corner lookups by itself. What is left is the per-block work: one
`final_density` evaluation and one `Aquifer.computeSubstance` for every block of the column, from
the top of the world to the bottom, with no early exit and one closure call per node. The 2.5
times row is a target, not a measurement.

**WebAssembly is worth 6.4 times on the arithmetic and only if the whole fill moves inside it.**
An exported call costs 9.7 nanoseconds, so calling into WebAssembly per density sample would spend
2.9 ms per chunk on call overhead before doing any work. Compiled once, a `WebAssembly.Module`
travels through `postMessage`, so every worker instantiates the same module. The hazard is that
floating point multiplication is not associative. The measured port diverged by 1.4e-13 purely
because the hand-written WAT computed `t*(t*(t*x))` where the JavaScript computed `((t*t)*t)*x`.

**The honest conclusion.** 50 chunks per second is reachable on both models, and it needs the
ladder, the structure rejection fix, the pool and a WebAssembly terrain kernel together. 100
chunks per second is reachable while filling a region and not while walking a front, where the
structure window keeps paying. No stage reaches the target alone, and the pool, which is the part
that sounds like the answer, is worth less than the two algorithmic stages beside it.

The number this rests on is terrain at 227 ms per chunk. After the ladder and the rejection fix,
terrain is about 90% of the per-chunk cost, so the whole remaining question is how fast
`ChunkSampler` can fill a chunk. 50 chunks per second on a front needs it about 2.5 times faster;
100 chunks per second on a fill needs it about 4.5 times faster. WebAssembly measured 6.4 times
on the arithmetic, which is the only measurement in range of either, and it only applies if the
whole fill moves inside the module.

The terrain rows are an average and the beardifier is why they are not a constant. A chunk away
from every structure pays 0.5 ms for it; a chunk inside an ancient city's beard pays 220 ms per
terrain tile. The ladder takes that from three tiles per chunk to one, which is the largest
single thing the ladder buys that is not in the 454 ms, and indexing the pieces by column instead
of scanning the list on every sample takes most of the rest. Until that lands, terrain near a
large structure costs several times the 227 ms these rows assume, in exactly the places players
walk to.

## What guarantees byte-identical output

This is the project's parity claim and it is the thing most easily lost, so each guarantee is
stated with the mechanism that enforces it rather than as an intention.

**1. Every status body is a pure function of the seed, the chunk position and the frozen outputs
of lower statuses.** The step table declares, per status, the status each neighbour at each
distance is guaranteed to have reached. The proto chunk view a status is handed refuses a read
outside that window and throws, the way `WorldGenRegion.getChunk` builds a `CrashReport` rather
than returning a chunk at the wrong status. An undeclared input is a crash on the first chunk, not
a silent difference on the thousandth.

**2. Each (chunk, status) body runs exactly once.** The holder keeps one promise per status, the
first caller creates it and every other caller awaits it. Nothing re-enters a status, so no step
can be applied twice with different inputs. Only the thread that owns the holder map mutates it.

**3. Every random draw is reseeded from the seed, a position and a fixed index.** That is Java's
rule and `packages/features/src/placement/WorldgenRandom.ts` already implements
`setDecorationSeed`, `setFeatureSeed` and `setLargeFeatureSeed`, and
`packages/worldgen/src/random/` the two random sources they run over. The fixed index is the
global feature index from `sortFeaturesPerStep`, which depends on the registry contents and on
nothing else. Three things would break this and all three are mechanical: `Math.random` is seeded
independently per V8 isolate and produced seven different sequences across a main thread and six
workers; `localeCompare` orders identifiers differently from a plain comparison; and an object
whose keys are numeric strings enumerates them before the rest. A lint rule bans the first two
under the generation packages, and ordered data uses `Map` rather than a plain object.

**4. No two concurrent bodies write the same block.** Every status except `features` writes only
its own chunk. `features` writes radius 1, and its writes outside its own chunk are recorded as a
patch rather than applied, so two feature passes that overlap never race. Each produces an
independent patch, and the owning holder merges them. The merge order is fixed by position, the
chunk's own writes first and then the eight inbound patches in a fixed neighbour order, so the
merged result is a function of position alone.

**5. Float arithmetic is identical across isolates.** Measured: transcendentals, `a*b+c` without
FMA contraction, object, `Map` and `Set` iteration order and `Array.prototype.sort` were
bit-identical across a main thread and six workers, and identical again under `--no-opt`,
`--jitless` and `--max-opt=0`. 36 chunk digests matched across 1, 2, 4, 6, 8 and 10 workers. The
one way to lose this is to rewrite a kernel in another language and reassociate an expression. The
measured WebAssembly port did exactly that and diverged by 1.4e-13, so a port carries a
bit-pattern fixture test per expression, not a tolerance.

Together those make the output of every status a function of the seed and the position. The
falsifiable form of that claim, which the parity corpus runs, is that the digests of a fixed set
of chunks are identical across generation orders (row major, reversed, and a seeded shuffle) and
across pool sizes (inline, 1, 2, 4, 6, 8).

## The one divergence from Java we accept

Java's feature pass writes through a live `WorldGenRegion` straight into the neighbour's
`ProtoChunk`, so a tree in chunk C can see and be blocked by a tree that chunk N's own feature
pass already placed. Whether it does depends on which of C and N reached `features` first, which
depends on scheduling. Java's own output at a chunk border is therefore not a function of the seed
alone.

Recording a patch instead of writing through makes our output a function of the seed alone, at the
price of one case: a feature whose placement decision reads a block that a neighbouring chunk's
own feature pass wrote. That feature now reads the neighbour's terrain and does not see the
neighbour's features. The failure mode is two features from different chunks occupying the same
space instead of the second being refused.

This is not a new divergence. `DataDrivenGenerator.generateChunk` already reads neighbours through
`copyCenterFrom` over radius-0 terrain regions, so the current generator has the same read
semantics; what changes is only that the writes stop being replayed into already-emitted chunks.
The size of the affected set is measurable: the same chunk generated first and generated last
differs at 169 of 98304 positions today, 0.17%, and that was measured before the biome filter fix
cut the feature count per chunk.

The alternative, a positional total order over feature passes, was rejected on cost rather than on
principle. Any such order needs a proper colouring of the conflict graph, two chunks conflict when
their Chebyshev distance is 2 or less, and the chromatic number of that graph is nine. A nine-deep
colour chain means one cold chunk drags a 33 by 33 neighbourhood of feature passes with it before
it can finish, which is a stall on every teleport into ungenerated terrain.

## Alternatives rejected

**Keep the 3 by 3 region and add workers.** 43% of the per-chunk cost is the window and the
patch-back is order-dependent, so this parallelizes the waste and turns a reproducible defect into
a scheduling-dependent one. The patch-back also writes straight into an already-emitted `Chunk`
with `setBlockRuntimeId`, bypassing `World.writeBlockRuntimeId`, so a chunk already sent to a
player silently changes.

**Copy Java's threading exactly: `features` inline on one single-task executor.** This keeps
Java's read semantics and pays for them twice. The output stops being a function of the seed, so
the order-independence check cannot be green; and the one remaining serial step caps throughput at
one over its own cost, which at today's 16 ms is 62 chunks per second whatever the pool does.

**Generate 4 by 4 or 16 by 16 chunk regions per worker.** It amortizes the shared per-column work
and sends 16 chunks in one message. The message cost it saves is already 0.2% of a core at 100
chunks per second, and it makes the unit of work something other than the chunk the server asks
for. Worth revisiting if per-column amortization turns out to be large; not worth paying for the
messaging.

**A separate generation process over a socket.** Same event loop isolation as workers, plus crash
isolation this code does not need, and it loses both transferable `ArrayBuffer` and the shared
registry bundle. The bundle was the largest measured startup saving: 75 ms for eight workers
against 540 ms reading from disk and 289 ms through `workerData`, where the `workerData` cost
lands on the main thread.

**A native addon instead of WebAssembly.** It buys SIMD and real shared memory and costs a
compiled artifact per platform. These packages are published to npm, so a mandatory native addon
changes every consumer's install. It also lets the compiler contract multiply-add into a fused
instruction unless told not to, which is a world that is subtly not Java's and would pass every
tolerance-based test.

**deepslate.** Already rejected in `packages/worldgen/README.md`. It has no carvers and no placed
features, and it is slower than this repository's own sampler: 630 ms for a terrain pass against
227 ms for a whole terrain-only chunk here, because it looks cell corners up in a `Map` keyed by a
template string at 108 ns against 3 ns for a flat `Float64Array` lattice.

## Consequences

`Generator.generateChunk(cx, cz, seed, config): Promise<Chunk>` keeps its signature, so
`Anvil.readChunk`, `LevelDB.readChunk` and `ChunkScheduler` are unaffected. `DataDrivenGenerator`
becomes an adapter that asks the generation service for a chunk at `full`.

`ChunkScheduler.tick` awaits one chunk at a time inside a 5 ms per-tick budget
(`ChunkScheduler.ts:83`). That was the right shape for a generator that blocked the loop and it
is the wrong one for a pool that can hold six chunks in flight, because it keeps the pool at a
depth of one and caps delivery to a player at one chunk per await. It has to ask for several at
once, which the plan does in the slice that lands the pool. `World.preload` already batches 32
through `Promise.all` (`World.ts:759`), so the preload path does not need the change and the
per-player path does.

`applyFeaturePatch`, `applyPatchToChunk`, `copyCenterFrom`, `featurePatches`, `generatedChunks`
and `serializeGeneration` are deleted. `GENERATION_CACHE_SIZE` goes with them. Holders are
retained by the generation task that needs them and released when every chunk in their write
radius has reached `full`, which replaces an LRU that silently dropped cross-chunk writes past 128
chunks.

Chunk border content changes once, at the slice that lands the patch merge. The golden corpus is
re-captured in that commit and the order-independence check goes green there.

The server gains a thread pool with a lifecycle. It is built at world load, pinned to one seed per
worker because `RandomState` costs 55 to 134 ms to rebuild, and terminated on shutdown.
`worker.terminate()` interrupts a busy worker in 2 to 24 ms, which is the only way to stop one,
because worker threads do not receive signals.

Memory grows with the retained working set. Six workers each holding the registries cost about 80
MiB apiece on top of the shared bytes, roughly 500 MiB, which is fine on 16 GiB and needs
rechecking on a small VPS.
