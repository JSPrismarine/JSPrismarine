---
'@jsprismarine/nethernet': patch
'@jsprismarine/prismarine': patch
'@jsprismarine/client': patch
---

NetherNet players on a long or lossy path no longer stall or disconnect after joining. NetherNet now runs on werift 0.27, which fixes SCTP stopping for good after a retransmission timeout and the slowdown on large send bursts. `adaptPeerConnections` keeps `nethernet`'s peer connections working on it. `jsp-client connect` and `bot` take `--network nethernet` to join over NetherNet, and `--latency` and `--loss` to simulate a slow path to the server.
