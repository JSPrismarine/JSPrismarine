---
'@jsprismarine/worldgen': patch
---

Add Java's world blender: `blending/Blender.ts` and `blending/BlendingData.ts` bend a new chunk's heights, densities and biomes toward the old chunks next to it, and filter its carvers, matching Java 26.3 exactly against the new `vectors/blending.json`. `blending/generationVersion.ts` exports the data versions that decide which chunks are old, and `NormalNoise.parity` ports Java's `NormalNoise.createParity`.
