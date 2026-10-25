---
'@jsprismarine/chunkgen': patch
---

Add `@jsprismarine/chunkgen`, the chunk generation ladder Java Edition 26.3 uses. It holds the ten
statuses (`empty` through `full`, with `noise`, `surface` and `carvers` already merged into
`terrain`) as a chain whose `isOrAfter` is an integer comparison, and the step table from
`ChunkPyramid.GENERATION_PYRAMID`, transcribed call by call out of the pinned server jar. Each step
declares the status every neighbor at each Chebyshev distance is guaranteed to have reached and how
far it may write blocks: `terrain` writes radius 0, `features` radius 1, and the other eight keep
the default of -1, which excludes even their own chunk. `ChunkStep.requireReadable` enforces the
read window the way `WorldGenRegion.getChunk` does, by throwing rather than returning a chunk at
the wrong status, so an undeclared input is a crash on the first chunk instead of a difference on
the thousandth. The accumulated dependencies are the transitive closure a scheduler sizes its
layers from: one chunk reaching `full` needs radius 11 at `structure_starts`, 3 at `biomes`, 2 at
`terrain` and 1 at `features`. Tests reproduce both dependency tables cell by cell against the
research note, and `SAFETY_MARGIN_CHUNKS` lands on Java's 90 only when the accumulated list for
`full` is exactly 12 long. Nothing imports the package yet; the holder, the scheduler and the
worker pool land in later slices.
