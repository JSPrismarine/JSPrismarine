---
"@jsprismarine/prismarine": minor
---

`Chunk` hands out its sub chunks and biomes read-only, so every write reaches the save cut before it lands. `getSubChunk`, `getOrCreateSubChunk`, `getSubChunks` and `getSubChunkEntries` return `ReadonlySubChunk`, whose `getStorages` returns `ReadonlyBlockStorage`, and `getBiomes` returns `ReadonlyChunkBiomes`. None of them has a setter. A plugin that wrote through one calls the chunk instead: `setBlockRuntimeId`, `setBlock` or `fillColumn` for blocks, and the new `setBiome` and `fillBiomeColumn` for biomes. To replace the whole column, build a `ChunkBiomes` and pass it to `setBiomes`, which now marks the chunk changed. `getOrCreateSubChunk` returns the sub chunk already at that index, where it used to replace it with an empty one.
