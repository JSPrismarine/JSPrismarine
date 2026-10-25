---
'@jsprismarine/prismarine': patch
---

Stop the autosave freezing the server. `World.saveChunks` ran `Promise.all` over every changed
chunk, and writing a chunk is synchronous, so the whole save was one uninterrupted run of work.
The first autosave after a start region preload has all 441 chunks to write: the event loop was
held for ten seconds and the tick loop came back reporting 200 skipped ticks. It now writes in
batches of eight with a yield between them, the way the preload already generates.
