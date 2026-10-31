---
"@jsprismarine/prismarine": patch
---

Add `Anvil.regionDirectory(dimension)`, which answers `dimensions/<namespace>/<path>/region` for every dimension but the Overworld and falls back to `DIM-1` and `DIM1` for saves written before Java 26.1, and `Anvil.listChunks(dimension)`, which reads the location table of each region file there.
