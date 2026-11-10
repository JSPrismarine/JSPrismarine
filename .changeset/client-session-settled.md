---
"@jsprismarine/client": patch
---

Add `ClientSession.isIdle()` and `settled()`, which tell a harness running a client and a server in one process when the client has handled every batch it received and every send has reached the transport.
