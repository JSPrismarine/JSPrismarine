---
"@jsprismarine/prismarine": patch
---

Add `Server.advanceTick()` and `ServerTicker.advance()`, which run one tick by hand on a server started with ticking disabled. Each call runs the same work, in the same order, as a tick of the loop, and sets no timer, so a harness such as the replay suite takes the same steps on any host.
