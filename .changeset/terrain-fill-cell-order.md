---
'@jsprismarine/worldgen': minor
'@jsprismarine/prismarine': patch
---

Make the terrain fill cheaper without moving a block. `ChunkSampler` gains `cellCount` and
`forEachCellBlock`, which walk a chunk one interpolation cell at a time instead of column by
column, and `DataDrivenGenerator` fills through them: a column walk left an interpolation cell
every eight blocks and made the density stack refetch its eight corners 57177 times per chunk
where the lattice holds 768 cells. An `interpolated` node now keeps its cell state in flat typed
arrays, takes its lattice index from a shift and its interpolation weight from a table, and its
corner cache is sized to the 8 by 8 by 64 window a chunk's lattice actually occupies rather than
four times that.

`SampleContext.interpolationCorners` is now the flat buffer rather than a lookup method, and
`beginInterpolationCell` is replaced by `interpolationCell`. Both are seams for the compiled
density closures; nothing outside the density stack called them.

Separately, the structure beardifier indexes its pieces by the columns they reach. It is the
right operand of the top-level add in the overworld's `final_density`, so it runs on all 98304
samples of a chunk and used to scan every nearby piece on each one.

Every step is bit-identical, which the six golden chunks, the Java terrain vectors and a new
block-for-block comparison between the two walks assert.
