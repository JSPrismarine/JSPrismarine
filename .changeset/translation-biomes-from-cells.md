---
'@jsprismarine/prismarine': patch
'@jsprismarine/errors': patch
---

Pack a generated chunk's biome sections from the cells its terrain pass already sampled. When generation runs on the server thread (one core, or `chunk-workers: 0`), the terrain tile carries its biome cells but no packed sections, and translation resolved every cell from the biome source again, searching the climate tree wherever the memo had evicted it. Over a 3 by 3 block of decorated chunks, climate searches for the chunks' own cells fall from 21,211 to 15,476, against 13,824 cells. The packed biomes are the same.
