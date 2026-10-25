---
'@jsprismarine/prismarine': patch
---

Find a world's spawn from the terrain instead of from finished chunks.

`World.findSurfaceSpawn` widens in 8-block rings to a radius of 256 and asked `getChunkAt` for
every candidate, so each one was a fully generated chunk: carved, surfaced, decorated and
translated. A seed whose origin is open ocean pays that for every chunk between the origin and the
nearest shore, and it pays it before the start region prints its first line. At seed 1234 the
origin region is all ocean - 3601 of the 3602 candidates before the shore read as water - and the
search had generated 246 chunks in 330 seconds without reaching land, so a boot showed no progress
at all.

Generators may now offer `surfaceAt`, which reports the topmost block of one noise column without
generating anything. That is Java's `ChunkGenerator.getBaseHeight`, and it is what Java's own spawn
finding asks. The overworld answers from the bare terrain it already lays structures out against;
a generator that offers nothing cheaper keeps the old path.

On a fresh server directory at seed 1234, the overworld's start region now prints and finishes 9
chunks in 6.6 seconds, with the world ready 27 seconds after it began loading, where before it had
generated nothing anyone could see after 396 seconds. At `preload-radius: 3` it is 49 chunks in
14.4 seconds.

No generated block moves. The spawn position does change for a seed where the old search settled on
decoration: it now lands on the ground rather than on whatever grew there, since bare terrain never
puts a leaf or a flower on top of a column.
