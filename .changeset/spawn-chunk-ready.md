---
'@jsprismarine/spawning': patch
---

Add the optional `SpawnWorld.chunkReady(chunkX, chunkZ)`. The spawner skips a sampled chunk the world says is not ready, as Java spawns only in the chunks it ticks. A world that leaves it out takes spawn attempts in every loaded chunk, as before.
