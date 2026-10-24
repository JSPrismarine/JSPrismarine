---
'@jsprismarine/protocol': patch
---

Add `SubChunkPacket` (id 174), the server's answer to `SubChunkRequestPacket`, at the protocol 2193 layout: a cache flag, the dimension, a center `SubChunkPos`, then one entry per sub chunk with its `SubChunkPosOffset`, result, optional serialized sub chunk, `SubChunkHeightmapData`, and optional blob id. The three structures are new and exported from `structure/`. The optionals carry presence bytes and each heightmap row a length prefix, as Mojang's Cereal migration at protocol 2168 defines; the serialized sub chunk stays an unparsed buffer, like `LevelChunkPacket`'s payload.
