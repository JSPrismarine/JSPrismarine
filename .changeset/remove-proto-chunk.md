---
"@jsprismarine/chunkgen": minor
"@jsprismarine/prismarine": patch
---

Remove `ProtoChunk`, `ProtoChunkDetachedError`, `HEIGHTMAPS` and the `ProtoChunk*` payload types from `@jsprismarine/chunkgen`. Nothing ran on them: the server's generator climbs the ladder with its own `GenerationChunk`. `ChunkHolder`, `ChunkHolderMap`, `GenerationScheduler`, `StepRegion`, `StepTask`, `StepTasks`, `NeighborReader` and `ChunkStepBody` now take the chunk type as a required parameter. `ChunkStatusRegressionError` moves beside `StagedChunk`, and the prismarine generator raises it in place of its own `GenerationChunkRegressionError`.
