---
"@jsprismarine/prismarine": minor
---

Systems inside a tick no longer load chunks and wait for them. `World.chunkTickets()` returns the world's `ChunkTickets`: `request(owner, chunks)` starts a load outside the tick for each missing chunk, returns whether all of them are loaded, and keeps them from unloading until `release(owner)`. A chunk a ticket loads enters at an input step like any other.

- The dragon fight waits for its arena before it scans or resumes a saved respawn, for the podium's and the next gateway's chunks before it runs a dead dragon's consequences, and for each pillar's chunks before it resets the pillar.
- `RespawnSearch.attempt` reads loaded chunks only and answers or says it is waiting. `RespawnRequests.request` takes the search, the request and what to do with the answer, and each input step tries the waiting requests again, one per player at a time. `PlayerSession.respawn` is replaced by `requestRespawn`, and `requestRespawnPoint` files a request for the respawn point. `RespawnSearch.find` and `PlayerSession.getRespawnPoint` still load what they lack and wait, for portal travel out of the End. `resolveRespawn` and `clearRespawnFeet` are synchronous and take synchronous terrain reads, and `RespawnWorlds` gains `built`.
- `World.setBlockRuntimeId`, `World.setBlockByName` and `World.breakBlock` are synchronous and return a boolean. They decline a write into a chunk that is not loaded instead of loading it. `World.loadedBlock` reads a block from a loaded chunk.

A client sees the same thing as before, except that an effect waiting for a chunk that was not loaded now arrives at the first tick after the chunk does: the dragon's death consequences when the gateway's chunks were not loaded, a pillar reset whose chunks were not loaded, and a death screen or respawn whose spawn chunks were not loaded. A break or a `/setblock` in a chunk that is not loaded now does nothing.
