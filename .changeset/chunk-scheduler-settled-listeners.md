---
"@jsprismarine/prismarine": patch
---

`ChunkScheduler.settled()` no longer keeps a listener for each wait that its deliveries finished without parking. Only a park cleared them, so a harness that settles every tick held one more each time.
