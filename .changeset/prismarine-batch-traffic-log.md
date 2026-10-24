---
'@jsprismarine/prismarine': patch
---

Log the packets inside an asynchronously compressed batch at `silly` level. Chunk batches went out through `MinecraftSession.sendBatchAsync` with no traffic line, so a packet trace of a join showed the `NetworkChunkPublisherUpdate` packets with a gap where each `LevelChunkPacket` was sent. `BatchPacket.getPacketNames()` reports what a batch holds, and `PacketLogFilter.shouldLogName()` applies `log-excluded-packets` by name.
