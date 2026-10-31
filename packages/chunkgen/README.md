# @jsprismarine/chunkgen

Java Edition's chunk generation ladder. A chunk is at one of ten named statuses, a step table says
what each status may read and how far it may write, and the proto chunk is the state one status
hands to the next.

This package holds no world, no noise and no features. What it gives the server is the shape those
things have to run in if the same seed and the same chunk position are to produce the same blocks
whatever order chunks are generated in and however many threads do it.

```ts
import { GENERATION_PYRAMID } from '@jsprismarine/chunkgen';

const features = GENERATION_PYRAMID.stepTo('features');
features.requireReadable(1, 0, 'terrain'); // 'terrain'
features.requireReadable(1, 0, 'features'); // throws ChunkReadOutOfWindowError
features.canWriteBlocksAt(1, 0); // true, and it is the only step for which that is true
```

The tables come out of Mojang's 26.3 server jar, read class by class in
[java-chunk-generation-pipeline.md](../../docs/research/java-chunk-generation-pipeline.md). The
decision to copy them rather than derive something equivalent is
[ADR 0002](../../docs/adr/0002-chunk-generation-architecture.md).

## The ten statuses

`empty`, `structure_starts`, `structure_references`, `biomes`, `terrain`, `features`,
`initialize_light`, `light`, `spawn`, `full`. `register` sets each status's index to its parent's
plus one, so the ladder is a chain and `isOrAfter` is an integer comparison.

26.3 has ten, not the twelve older versions had: `noise`, `surface` and `carvers` are one `terrain`
status whose task runs noise fill, surface materials and carvers back to back.

Three of the ten have no body in this repository yet. Lighting lives in
[`@jsprismarine/lighting`](../lighting/README.md) and spawning in
[`@jsprismarine/spawning`](../spawning/README.md), and neither is sequenced against generation
today. They stay on the ladder anyway. Collapsing them would shift every accumulated radius by one,
and the step table would stop being something anyone can check against the jar.

## The step table

Each step declares two windows and one radius.

**Direct dependencies.** Per Chebyshev distance, the status that ring is guaranteed to have
reached. This is what a running body may read, and `requireReadable` throws rather than returning a
chunk at the wrong status, the way `WorldGenRegion.getChunk` raises a `ReportedException`. An
undeclared read is a crash on the first chunk rather than a wrong block on the thousandth.

| Step | d=0 | d=1 | d=2 | d=3..8 |
| --- | --- | --- | --- | --- |
| `empty` | outside the window | | | |
| `structure_starts` | `empty` | outside | | |
| `structure_references` | `structure_starts` | `structure_starts` | `structure_starts` | `structure_starts` |
| `biomes` | `structure_references` | `structure_starts` | `structure_starts` | `structure_starts` |
| `terrain` | `biomes` | `biomes` | `structure_starts` | `structure_starts` |
| `features` | `terrain` | `terrain` | `structure_starts` | `structure_starts` |
| `initialize_light` | `features` | outside | | |
| `light` | `initialize_light` | `initialize_light` | outside | |
| `spawn` | `light` | `biomes` | outside | |
| `full` | `spawn` | `features` | outside | |

The `full` row is the one that is not the jar's. Java's `full` declares nothing, because its
feature pass has already written through into the neighbor. Ours reads the eight neighbors at
`features` to collect the patches they recorded for it. The accumulated table does not move:
`full` already guaranteed `initialize_light` at distance 1, which is above `features`.

**Accumulated dependencies.** The transitive closure of the above, which is what sizes each layer
of a scheduler. Inverting the `full` row gives the radius each status has to reach before one chunk
can become `full`: 11 for `empty` and `structure_starts`, 3 for `structure_references` and `biomes`,
2 for `terrain`, 1 for `features` and `initialize_light`, 0 for `light` and `spawn`. Generating one
chunk from nothing therefore touches 529 chunks at `structure_starts` and 25 at `terrain`.

**The block write radius.** `terrain` is 0 and `features` is 1. Every other step is -1, and -1
excludes the step's own chunk, so those steps cannot write a block through the region at all.
`features` is the only status that writes into a neighbor, which is why a tree is whole across a
chunk border, and it is the only place two concurrent bodies could collide.

Two numbers in the package exist as arithmetic checks on the table rather than for their own sake.
`RADIUS_AROUND_FULL_CHUNK` is 11 and `SAFETY_MARGIN_CHUNKS` is 90, and the second needs the
accumulated list for `full` to be exactly 12 long. A transcription slip anywhere in the pyramid
moves one of them.

## The proto chunk

`ProtoChunk` is the chunk below `full`: a block palette with a `Uint16Array` of indices, the four
heightmaps as one `Int32Array`, a biome palette with an index array of 4 by 4 by 4 cells, and the
block entity and entity spawn requests a status recorded for the server to act on later. The block
buffer is 98304 entries, which is 192 KiB for an overworld column.

Everything that crosses a thread boundary is a flat typed array, and that is the point of the
representation rather than a detail of it. Measured round trip for one 192 KiB column: 18
microseconds moved through a transfer list, 76 copied, and 1370 as a plain `number[]`. Receiving
one costs the main thread 20 microseconds against 298 for a per-section object graph. Nothing that
crosses the boundary may be a class instance, a `Map` or an array of per-block objects.

```ts
const { payload, transferList } = chunk.transfer();
worker.postMessage(payload, [...transferList]);
// on the receiving thread
const rebuilt = ProtoChunk.adopt(payload);
```

`transfer()` gives the buffers up, so the chunk is spent as soon as it returns and reading it
raises `ProtoChunkDetachedError` instead of returning the zeros a detached buffer holds. `adopt()`
builds typed array views over the buffers that arrived, with no copy.

Two things the class does not do. It does not compute heightmaps, because deciding whether a block
counts toward `MOTION_BLOCKING` needs block facts this package does not hold, so the body that
writes the blocks writes the heights with them. And it does not police neighbor reads: a position
outside its own 16 by 16 column reads as air and refuses a write, and the step table is what turns
an undeclared neighbor read into a throw.

## The holder and the scheduler

A `ChunkHolder` is one chunk's place in the ladder: the proto chunk, and one promise per status.
The first caller to ask for a status creates the promise and runs the body; every later caller
awaits that same promise. That is what makes a (chunk, status) body run exactly once however many
requests overlap. Java needs a compare-and-exchange on `startedWork` for it, because several pool
threads reach `applyStep` at once; only the thread that owns the holder map touches a holder here,
and a map insert cannot be interleaved. `startedWork` is kept anyway, because it is what catches a
layer loop that skips a rung.

`ChunkHolderMap` decides how long a holder lives, by reference count. A run acquires every chunk
inside its radius before it runs a step and releases them all when it finishes, so nothing it
depends on can be dropped while it is in flight, and a holder nothing needs goes away. The
generator's 128-entry LRU got this wrong in a way that was measurable: `preload-radius: 5` is 121
chunks, right at the edge, so a feature pass writing into a neighbor could land on a holder that
had already been evicted. A caller that wants a chunk to stay resident past a run acquires its own
reference.

`GenerationScheduler` is the layer loop. To bring a chunk to a status, the neighborhood has to
reach that status's dependencies first, so a run walks the ladder from `empty` upward and applies
each step to the square the accumulated dependency table sizes.

```ts
const holders = new ChunkHolderMap((chunkX, chunkZ) => ProtoChunk.create({ chunkX, chunkZ, minY: -64, height: 384 }));
const scheduler = new GenerationScheduler({ holders, tasks: { terrain: buildTerrain } });

scheduler.layersFor('terrain'); // [['empty', 9], ['structure_starts', 9], ..., ['terrain', 0]]
const chunk = await scheduler.generate(0, 0, 'terrain');
```

A status with no entry in `tasks` passes its chunk through, which is what every status above
`terrain` does today. The bodies live in the server, because they need the noise, the biome source
and the feature registries; the scheduler only knows how to order them and what each one may read.

Two properties follow, and the tests count them rather than assert them in prose. Nine chunks asked
for at once at a `full` target build terrain over the union of their windows, 49 bodies, where
`DataDrivenGenerator.generateChunk` builds a 3 by 3 tile per chunk and so builds 81. And the
sixteen chunks of a 4 by 4 area come out identical whether they are asked for row major, reversed,
shuffled, one at a time or all sixteen at once.

## The feature patch

`features` is the one status that writes outside its own chunk, and the one place two bodies
running at once could land on the same block. Nothing writes through. A feature's writes into its
own chunk apply as they happen, so features inside a chunk still see each other the way Java's do;
a write that lands in a neighbor is recorded and handed to that neighbor's `InboundFeaturePatches`.
The neighbor applies its own post-`features` state first and the patches after it, in
`FEATURE_PATCH_ORDER`.

```ts
inbound.receive(-1, 0, patchFromTheWest);
inbound.inMergeOrder(); // ordered by position, not by when each arrived
```

The order is `(dx, dz)` ascending with `dx` fastest, and storing by source offset rather than
appending to a list is the mechanism rather than a detail: a list would record arrival order, and
arrival order is what the scheduler chooses. `receive` refuses the chunk's own offset and anything
past radius 1, and refuses a second patch from the same neighbor, which would mean a `features`
body ran twice.

This is ADR 0002's one deliberate deviation from Java. Java writes through a live `WorldGenRegion`
into the neighbor's proto chunk, so which of two overlapping features wins depends on which chunk
reached `features` first, which depends on scheduling; Java's border output is therefore not a
function of the seed alone, and ours is. The price is one case: a feature whose placement decision
reads a block sees the neighbor's terrain and not the neighbor's features, so two features can end
up in the same space where Java would have refused the second.

## Driving something other than a proto chunk

The holder, the map and the scheduler take the chunk type as a parameter, defaulting to
`ProtoChunk`. All they need of it is `StagedChunk`: where it is, which rung it is on, and an
`advanceTo` that refuses to go backward.

The seam is there because a server that already has a chunk buffer should climb the ladder with
that buffer. `@jsprismarine/prismarine` does: its generation stages speak Java block states with
properties, which a flat string palette would have to encode on the way in and decode on the way
out, twice per status. `ProtoChunk` stays the representation a worker transfers.

## The worker pool

`GenerationPool` runs status bodies in worker threads, over piscina. It knows a chunk position
and a status name and nothing else about world generation, so this package does not depend on the
server.

A caller names a **pipeline module**. Each worker imports it once, hands it the pool's `setup`
value, and keeps whatever it builds for the life of the worker. That is the whole reason a worker
is worth starting: a seed's noise tables cost 55 to 134 ms to build and the 7594-entry climate
biome source 145 to 345 ms, so a worker is pinned to one world rather than told which world each
task belongs to.

```ts
const pool = new GenerationPool({
    pipeline: '/path/to/built/terrainPipeline.js',
    workers: 6,
    setup: { seed: 1234n, registryBundle }
});

const { payload } = await pool.run({ status: 'terrain', chunkX: 3, chunkZ: -14, input: beardPieces });
```

The pipeline module exports `createGenerationPipeline`, which answers with an object that has a
`run`. A body hands back a payload and the list of `ArrayBuffer`s inside it, and the pool
transfers those rather than copying them: 18 microseconds for a 192 KiB column against 76 cloned
and 1370 as a `number[]`.

Two constraints are not negotiable.

**Only a status that writes radius 0 belongs in a worker.** `terrain` is one, which is why Java
sends it to a thread pool and keeps `features`, which writes radius 1, on a single executor. Two
`terrain` bodies can never touch the same block, so no two workers can race.

**The module has to be something the worker's loader can `import()`.** A worker thread inherits
`process.execArgv`, so the loader the host was started with is already installed in the worker. A
published install needs nothing: the specifier is a built `.js`. A dev checkout runs under
`node --import tsx`, and its workers do too, which is what follows the extensionless
`@jsprismarine/*` imports a `.ts` pipeline module is full of. Nothing has to be built first.

A host that reads TypeScript through a loader of its own, which is vitest, has no such flag to
hand on, and its workers would read the `.ts` through Node's strip-only loader, which stops at the
first extensionless import. When the pipeline or the worker entry is TypeScript source and nothing
in `process.execArgv` or `NODE_OPTIONS` installs an ES module loader, the pool starts its workers
with `--import` and the `tsx` resolved from beside the pipeline module, which is the one the
package being run from source declares. `workerExecArgv(options)` is that decision, exported so a
caller can see what its workers will get.

`Math.random` is shadowed inside the worker and throws. It is seeded independently per V8
isolate, so a main thread and six workers produce seven different sequences and a decorator that
reached for it would give a different world depending on which worker ran the chunk.

### When a pool cannot start

`GenerationPool.unavailable(options)` answers with a sentence or with undefined, and a caller is
expected to ask before it builds one. It refuses a single executable, where the modules live in
the binary and no worker thread can reach them, and it refuses a worker entry or a pipeline
module that is not on disk.

It cannot promise the import succeeds, because that depends on the loader, so the first task is
still the real test. A caller that wants a server rather than a fast one catches that rejection,
says so once, and runs the body on its own thread.

## Installation

To install `@jsprismarine/chunkgen`, use the following command:

```
pnpm install @jsprismarine/chunkgen --save
```
