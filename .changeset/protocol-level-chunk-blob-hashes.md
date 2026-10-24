---
'@jsprismarine/protocol': patch
---

`LevelChunkPacket` carries `Cache Metadata`. `LevelChunk` gains an optional `blobHashes` list that is written after `Cache Enabled` and filled in on read, where the packet used to write an empty list whatever the cache flag said and drop the hashes it read. The class documents the protocol 2193 wire layout, and `ChunkRadiusUpdatedPacket` and `ChunkPos` gain byte-level tests.
