---
'@jsprismarine/worldgen': patch
'@jsprismarine/prismarine': patch
---

Carry each terrain tile's sampled biome cells with the tile, so a feature worker, the server thread and a terrain cache hit read them instead of searching the climate tree again. With two workers, a 25-chunk block now runs about 40% fewer climate searches, and the generated chunks are byte-identical. `@jsprismarine/worldgen` adds `createBiomeCellMemo`, a biome memo that can be told answers computed on another thread.
