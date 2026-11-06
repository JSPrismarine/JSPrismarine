---
'@jsprismarine/prismarine': patch
---

Read a chunk back when a client asks for the sub chunks of one it was already sent but the world has since unloaded, and log a request for a chunk that is not loaded.
