---
'@jsprismarine/prismarine': patch
---

Release a chunk request's generation slot once its worker work is done, before it waits for the server thread's completion slice, so the next chunk starts generating meanwhile. A second request for a chunk waiting on its completion shares that completion instead of translating the chunk again.
