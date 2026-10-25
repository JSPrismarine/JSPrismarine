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
| `full` | `spawn` | outside | | |

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

## What is not here yet

The holder, the scheduler, the feature patch and the worker pool. They land in later slices of
[the plan](../../docs/plans/chunk-generation-rewrite.md), and until they do, nothing in the server
imports this package.

## Installation

To install `@jsprismarine/chunkgen`, use the following command:

```
pnpm install @jsprismarine/chunkgen --save
```
