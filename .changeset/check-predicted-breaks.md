---
'@jsprismarine/prismarine': minor
---

With server-authoritative block breaking, a survival player's `PredictDestroyBlock` breaks the block only when the server agrees it could have. The block has to be the one the player started mining, breakable, and mined for at least the time the tool in hand needs, allowing for Haste and Conduit Power and `MINING_LATENCY_TICKS` of network jitter. A block that breaks at once needs no mining. The block must still be the one mining began on, and switching the held slot starts the mining over for the new tool. A refused prediction stops the cracks and puts the block back on the player's screen. Restarting the cracks on the block already being mined keeps the time mining began. `BlockMining` gains the required fields `breakTicks` and `startedAt`, so code that builds one by hand has to set them; `World.startBlockCracking` fills both.
