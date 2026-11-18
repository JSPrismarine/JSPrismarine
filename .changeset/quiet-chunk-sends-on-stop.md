---
'@jsprismarine/prismarine': patch
---

`stop` no longer logs a warning and a stack trace for each chunk a player was still waiting for. The stopping generator refuses those chunks with `GenerationStopped`, which the chunk scheduler's failure handler now skips, as the world's own chunk loaders already do.
