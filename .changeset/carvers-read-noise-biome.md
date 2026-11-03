---
'@jsprismarine/worldgen': patch
'@jsprismarine/prismarine': patch
---

Select a source chunk's carvers from the noise biome at Java's quart coordinates instead of the jittered block biome. A data pack whose neighboring biomes list different carvers now digs the carvers Java digs, and each carved chunk skips 289 fuzzy biome lookups.
