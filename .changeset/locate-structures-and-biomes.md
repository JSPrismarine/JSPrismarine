---
"@jsprismarine/prismarine": minor
---

Make `/locate` find what the generator places. A structure search now counts its radius in rings of placement regions, as Java's `findNearestMapStructure` does, so a village set spaced 34 chunks apart is reached 3400 chunks out and the strongholds' concentric rings are searched whole; it reports Java's locate position, the start chunk's corner plus the set's `locate_offset`, beside the generation point. `#minecraft:village` and the other `tags/worldgen/structure` tags resolve to their members. `/locate biome` walks the climate sampler the way Java's `findClosestBiome3d` does, through the new `World.locateBiome` and `Generator.locateBiome`. `/locate poi` stays refused, since this server keeps no point of interest index.

`StructureSearchRequest.radiusInChunks` is now `radius`, in placement regions, and `StructureSearchResult`'s `x`, `y` and `z` are the locate position, with the generation point under `origin`. `Generator` gains the optional `locateBiome`, `membersOfTag` and `locatableNames`.
