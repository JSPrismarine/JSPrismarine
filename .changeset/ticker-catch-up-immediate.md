---
'@jsprismarine/prismarine': patch
---

Keep the event loop awake between back-to-back catch-up and sprint ticks. They waited on an unreferenced immediate, which let the loop sleep until another event woke it, so with RakNet on a worker thread a sprint ran two ticks a second instead of as fast as the host allows.
