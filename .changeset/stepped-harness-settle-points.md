---
"@jsprismarine/prismarine": patch
---

Add the reads a harness that steps the server needs to know a tick's work has settled: `MinecraftSession.isOutboundSettled()` and `settleOutbound()` for packets still being encoded, `ChunkScheduler.isIdle()` and `settled()` for chunk deliveries in flight, and `World.getPendingChunkLoadCount()` for chunk loads still reading from disk or generating. A load whose chunk is ready and waits for the next input step to admit it is not counted, so a count of zero can still leave chunks to enter the world at the next step.
