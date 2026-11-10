---
"@jsprismarine/prismarine": patch
---

Add the reads a harness that steps the server needs to know a tick's work has settled: `MinecraftSession.isOutboundSettled()` and `settleOutbound()` for packets still being encoded, `ChunkScheduler.isIdle()` and `settled()` for chunk deliveries in flight, and `World.getPendingChunkLoadCount()` for chunk loads not in the world yet.
