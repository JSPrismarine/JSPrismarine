---
"@jsprismarine/prismarine": minor
---

`Chunk` hands out its sub chunks and biomes read-only, so every write reaches the save cut before it lands. `getSubChunk`, `getOrCreateSubChunk`, `getSubChunks` and `getSubChunkEntries` return `ReadonlySubChunk`, whose `getStorages` returns `ReadonlyBlockStorage`, and `getBiomes` returns `ReadonlyChunkBiomes`. None of them has a setter. A plugin that wrote through one calls the chunk instead: `setBlockRuntimeId`, `setBlock` or `fillColumn` for blocks, and the new `setBiome` and `fillBiomeColumn` for biomes. `setBiomes`, which the generators and the provider call with a `ChunkBiomes` they built, now marks the chunk changed. The published entry points do not export `ChunkBiomes`, so a plugin writes biomes through `setBiome` and `fillBiomeColumn`, one block or one x and z column at a time. `getOrCreateSubChunk` returns the sub chunk already at that index, where it used to replace it with an empty one.
