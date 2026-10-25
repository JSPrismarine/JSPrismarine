---
'@jsprismarine/worldgen': patch
'@jsprismarine/prismarine': patch
---

Stop a structure's height query at the block it found, with aquifers still on.

`StructureLevel.baseHeight` sampled a whole 384-block column and then scanned it downward for the
topmost block the heightmap accepts, which paid for every block under the one it returned. Java's
`NoiseBasedChunkGenerator.iterateNoiseColumn` walks down from the dimension ceiling and returns at
the first match, so `ChunkSampler.columnTop` does that and `baseHeight` uses it. Heights are
remembered per column and heightmap, and a column already sampled for `baseBlock` answers without
sampling anything again.

No generated world moves. The aquifer part is the reason to say so: it is widely assumed that Java
samples this column with aquifers off, because it used to. 26.3's `iterateNoiseColumn` builds its
`NoiseChunk` from the dimension's own fluid picker and the settings' `aquifers` block, so an
underground lake is part of the surface a structure settles onto. Over 11,520 columns and 253
structure starts across three seeds, turning aquifers off would have moved 28 columns by up to 20
blocks and dropped a cold ocean ruin 28 blocks through the sea floor.
