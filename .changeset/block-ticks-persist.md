---
'@jsprismarine/prismarine': minor
---

Keep a chunk's scheduled block ticks in its `PendingTicks` record, beside its fluid ticks, so a repeater mid-delay or any other pending block update still runs after the chunk unloads and loads again, or the server restarts. A saved block tick runs only while the block it was scheduled for still stands, and a `PendingTicks` record Bedrock wrote now hands its block ticks over too. `Chunk.hasStoredFluidTicks` and `setStoredFluidTicks` are renamed `hasStoredTicks` and `setStoredTicks`, and the save context's `pendingFluidTicks` is `pendingTicks`, whose entries carry the tick's kind and type.
