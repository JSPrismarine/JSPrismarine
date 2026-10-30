---
"@jsprismarine/worldgen": patch
---

Add `parseDimensionType`, `parseLevelStem`, `parseWorldPreset`, `parseFlatGeneratorSettings` and `parseBiomeSource`, which read Java's `dimension_type`, level stem, `world_preset` and flat generator documents and build a `BiomeSource` from a stem's `biome_source`.
