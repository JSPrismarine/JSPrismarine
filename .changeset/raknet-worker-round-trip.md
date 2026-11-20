---
'@jsprismarine/raknet': patch
---

A session of `WorkerServerSocket` now answers `getRTT()` on the main thread. The worker reports each session's smoothed round trip time whenever it moves by a whole millisecond, so the main thread's copy is never more than a millisecond behind. Before this, the main thread's sessions always answered `null`.
