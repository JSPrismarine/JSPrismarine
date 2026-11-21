---
'@jsprismarine/worldgen': patch
---

Evaluate `final_density` a whole interpolation cell at a time in the terrain walk. `ChunkSampler.forEachCellBlock` now fills each cell's densities through a `CellProgram`, which runs the density tree one node at a time over the cell's blocks instead of one chain of closures per block, the way Java 26.3's `sampleVolume` evaluates it. The values are the closures' bit for bit; a node the program has no loop for runs its closure per position. Under every vanilla noise settings `final_density` runs no closure per block, where it ran about thirteen before. `RandomState.cellProgram` and `DensityFunctionCompiler.cellProgram` build one.
