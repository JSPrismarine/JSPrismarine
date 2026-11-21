---
'@jsprismarine/worldgen': patch
'@jsprismarine/prismarine': patch
---

The surface pass reads each column once before it walks it, through a new optional `SurfaceChunk.readColumn`, instead of calling `getBlock` about twice per block. `BlockArraySurfaceChunk` and the generator's regions implement it; a chunk without it is still read one block at a time. The blocks it places are the same.
