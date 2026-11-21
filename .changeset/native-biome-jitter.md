---
'@jsprismarine/native-worldgen': patch
'@jsprismarine/worldgen': patch
---

`NativeWorldgen.biomeJitter` derives the jitter Java's `BiomeManager` adds to a biome lattice point in C. `BiomeManager` uses it whenever the library loads, with the same bits, and takes `{ native: false }` to keep the TypeScript generator steps.
