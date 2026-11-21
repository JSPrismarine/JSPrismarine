---
'@jsprismarine/worldgen': patch
'@jsprismarine/prismarine': patch
---

The terrain pass writes whole cells: `ChunkSampler.forEachCellBlock` takes an optional bulk visitor that receives a cell's blocks as codes (`CellFluids`) wherever the native aquifer decided the cell or the walk proved it holds only the global fluid, and the generator's region writes such a cell in one loop. The blocks, column tops and fluid ticks are the same.
