---
'@jsprismarine/worldgen': patch
'@jsprismarine/prismarine': patch
---

The surface pass answers a `biome` condition from the eight cells a block's jittered biome lookup chooses among whenever they agree, and looks the block's biome up only where they differ. `BuildSurfaceOptions` gains an optional `biomeCellAt`, and `BiomeManager` gains `parentCell` and `cellBiome`. An overworld chunk makes about 550 biome lookups in its surface pass instead of about 11,400, and places the same blocks.
