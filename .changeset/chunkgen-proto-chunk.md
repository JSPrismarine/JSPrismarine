---
'@jsprismarine/chunkgen': patch
---

Add `ProtoChunk`, the chunk state every status below `full` works on. Storage is a block palette
with a `Uint16Array` of indices in `GenerationRegion`'s order, the four heightmaps as one
`Int32Array`, a biome palette with an index array of 4 by 4 by 4 cells, and the block entity and
entity spawn requests. `transfer()` returns a payload plus the three `ArrayBuffer`s to pass as a
transfer list, and `adopt()` rebuilds a chunk over buffers that arrived without copying one.
Measured round trip for a 192 KiB overworld column: 18 microseconds moved, 76 copied, 1370 as a
plain `number[]`, which is why nothing in the payload is a class instance, a `Map` or a per-block
object. A chunk refuses to be read after `transfer()` rather than reading the zeros a detached
buffer holds, and `advanceTo` refuses a status at or below the one the chunk already has, because
each (chunk, status) body runs exactly once. Heightmaps are stored rather than computed: the
`MOTION_BLOCKING` predicate needs block facts this package does not hold. Nothing imports it yet.
