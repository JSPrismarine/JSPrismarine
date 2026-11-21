---
'@jsprismarine/worldgen': patch
'@jsprismarine/prismarine': patch
---

Answer the surface pass's biome conditions from a chunk's own biome cells for the blocks whose jittered biome lookup reads no other cell. `BuildSurfaceOptions` gains an optional `localBiomes` box. An Overworld chunk now makes about 11,000 per-block biome lookups in its surface pass instead of about 25,000, with no extra climate searches.
