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

Two of those three are work the design does twice.

The 454 ms is the 3 by 3 window. `generateChunk` builds nine independent radius-0 terrain regions
and merges their centres into one radius-1 region with `copyCenterFrom`
(`DataDrivenGenerator.ts:236`). Walking along a row, each new chunk needs three new tiles. The
`terrainChunks` cache holds 128 of them and then evicts, so a preload at `preload-radius: 5` is
121 chunks and sits right at the edge.

The 875 ms is the structure scan, run ten times per chunk. `startsFor` scans Java's radius-8
reference window, 289 chunk positions per structure set, and lays out every start it has not seen
before (`javaStructureStarts.ts:169`). `beardPieces` calls it once per terrain tile, so nine times
per generated chunk over a union window of radius 9, and `decorate` calls it a tenth time. Laying
out one start asks `StructureLevel.baseHeight` for a ground height, and
`createNoiseStructureLevel.columnAt` answers it by sampling the entire 384-block column through
`ChunkSampler.column` (`javaStructureLevel.ts:64`), which is 384 `final_density` evaluations and
384 aquifer calls for one height. The column cache clears wholesale at 16384 entries and the
sampler cache at 256, so a structure that reaches past the window pays for the whole set again.

A CPU profile agrees about where the time is and says it is all the same work: 55% of samples are
inside density function and Perlin noise evaluation in `@jsprismarine/worldgen`, with
`gradDot` at 16.1% and `sampleAndLerp` at 11.4%.

## What each stage buys

The target is 50 to 100 chunks per second on an Apple M1 Pro, 6 performance cores plus 2
efficiency cores. Worker scaling on that machine peaks at 4.7 times one thread at five or six
workers, confirmed twice: a synthetic Perlin kernel peaked at 4.67 to 4.84 and real deepslate
chunk generation at 4.4
([parallel-chunk-generation-in-node.md](../research/parallel-chunk-generation-in-node.md)
section 6). So 50 chunks/s is 20 ms aggregate per chunk and 94 ms per chunk per worker, and 100
chunks/s is 10 ms aggregate and 47 ms per worker.

| Stage | Per chunk, one worker | Aggregate at 4.7x | Chunks/s |
| --- | --- | --- | --- |
| Today | 1572 ms | n/a, one thread | 0.6 |
| The ladder, nothing else | about 1110 ms | n/a, one thread | 0.9 |
| The ladder plus the pool | about 1110 ms | 236 ms | 4.2 |
| Plus the structure fixes | about 300 ms | 64 ms | 16 |
| Plus a faster terrain fill | about 185 ms | 39 ms | 26 |
| Plus a WebAssembly terrain kernel | about 90 ms | 19 ms | 52 |

Read the rows as follows.

**The ladder buys 1.4 times, and it is not optional.** It removes the 454 ms of duplicate
neighbour terrain outright, because each chunk's terrain is computed once into its holder and read
by up to nine feature passes. It computes each chunk's structure reference set once rather than
the ten times `startsFor` is called for it today, because the set lives on the holder, and it lays
each start out once at a radius-0 `structure_starts` status rather than on demand from whichever
window reached it first. It does not make
one terrain tile or one structure layout any faster. What it is really for is correctness and
parallelism. It is the only shape in which every status is a pure function, which is the
precondition for everything below it.

**The pool buys 4.7 times and no more.** That is measured, twice, on this machine, and it is a
property of six performance cores and V8 isolates rather than of this code. More workers past six
made it worse. At 4.7 times, the pool alone turns 1110 ms into 236 ms aggregate, which is 4.2
chunks per second. The target is 12 to 24 times further away than that.

**The structure fixes are the largest single item and the least explored.** 875 ms of 1572 is 56%,
and nothing has profiled how it splits between deciding a chunk is a structure chunk, laying out
the pieces, and writing the blocks. Three mechanisms are visible in the code: `baseHeight` samples
a whole column where Java's `iterateNoiseColumn` stops at the first block the heightmap predicate
accepts; the column and sampler caches clear wholesale instead of being retained by the holder;
and the scan runs ten times per chunk. The 300 ms row assumes those take structures to roughly 60
ms per chunk. That number is the one most likely to be wrong in either direction, and the plan
puts a measurement slice in front of the fix.

**The terrain fill is 227 ms for 98304 blocks, 2.3 microseconds per block.** The density stack is
already in good shape: `density/compile.ts` compiles the function graph to closures, and
`SampleContext.CornerCache` is a flat direct-mapped `Float64Array` lattice rather than deepslate's
template-string `Map`, which is worth 36 times on corner lookups by itself. What is left is the
per-block work: one `final_density` evaluation and one `Aquifer.computeSubstance` for every block
of the column, from the top of the world to the bottom, with no early exit and one closure call
per node. The 185 ms row assumes 2 times from cell-ordered iteration, typed scratch buffers and
skipping the empty air above the surface. That is a guess until someone profiles it.

**WebAssembly is worth 6.4 times on the arithmetic and only if the whole fill moves inside it.**
An exported call costs 9.7 nanoseconds, so calling into WebAssembly per density sample would spend
2.9 ms per chunk on call overhead before doing any work. Compiled once, a `WebAssembly.Module`
travels through `postMessage`, so every worker instantiates the same module. The hazard is that
floating point multiplication is not associative. The measured port diverged by 1.4e-13 purely
because the hand-written WAT computed `t*(t*(t*x))` where the JavaScript computed `((t*t)*t)*x`.

**The honest conclusion.** 50 chunks per second is reachable, and it needs the ladder, the pool,
the structure fixes and a WebAssembly terrain kernel, in that order. 100 chunks per second sits at
the edge of the arithmetic. It requires the whole per-chunk budget to fit in 47 ms on one worker,
which means terrain at 20 ms, structures at 20 ms and features at 7 ms, and nothing in the
measurements says the structure layout can reach 20 ms. Treat 50 as the commitment and 100 as the
thing a second round of profiling decides. No stage reaches the target alone, and the pool, which
is the part that sounds like the answer, is worth less than either algorithmic stage.

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
