---
'@jsprismarine/prismarine': patch
---

Report a chunk lost to a shutdown as a refusal, not as a thread pool failure.

Stopping the generator terminates its worker threads, which is the only way to stop a worker
halfway through a chunk, and a terminated worker rejects its task with its own error.
`World.preloadChunk` catches `GenerationStopped` and rethrows anything else as a real fault, so
a start region that was interrupted would have failed the world instead of saving what it had.
`GenerationQueue` now reports a build that failed after the stop as a refusal.

Measured on a cold 32 chunk batch stopped one turn in: 2.19 s and 31 refusals with the terrain
bodies inline, where the time is the one chunk already being built; 0.13 s and 32 refusals with
six workers, because terminating them does not wait for the chunk. Every refusal in both is a
`GenerationStopped`.
