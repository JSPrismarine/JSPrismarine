---
'@jsprismarine/prismarine': patch
---

Save a chunk again once the fluid ticks in its stored `PendingTicks` record have run, even when they moved no block, so a reload does not schedule them a second time. `Chunk` gains `hasStoredFluidTicks`.
