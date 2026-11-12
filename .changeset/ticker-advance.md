---
"@jsprismarine/prismarine": patch
---

Add `Server.advanceTick()` and `ServerTicker.advance()`, which run one tick by hand on a server started with ticking disabled. Each call runs the same work, in the same order, as a tick of the loop, and sets no timer, so a harness such as the replay suite takes the same steps on any host. The harness calls `server.getChunkCompletionQueue().activate()` before its first step, as the loop does when it starts; until then, inputs and finished chunks are applied when they arrive instead of waiting for the next step.
