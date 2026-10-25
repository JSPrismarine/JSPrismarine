---
'@jsprismarine/prismarine': patch
---

Run the autosave alongside the tick rather than inside it. `World.update` awaited `save()`, and `Server.tick` installs the next tick's timer only once `update` has resolved, so the whole server stopped for as long as the save took. On a fresh Overworld whose 441 start region chunks are all dirty that was 1586 ms in one tick, close enough to the loop's 2000 ms catch-up limit that a loaded host crossed it and reported ninety skipped ticks. The tick now starts the save and moves on, which is what lets the existing `setImmediate` yields in `saveChunks` reach the tick loop instead of only the socket. Writing those chunks still takes about 1500 ms of wall time, but it is spread across ticks: over the same 70 second window the worst tick fell from 1586 ms to 59 ms and the world held 20.00 TPS.

A save already running when the next falls due is skipped rather than queued, so two passes cannot write the same chunks at once and race on `Chunk.markSaved`. `World.save` waits for whatever the tick started before writing anything of its own, so a shutdown still finishes every outstanding write before it closes the provider.
