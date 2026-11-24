---
'@jsprismarine/raknet': patch
---

`WorkerServerSocket.waitForRoundTripSamples(count)` resolves once the network worker has counted that many round trip samples. It waits on the shared metrics counter, which the worker now raises after it writes the round trip events the samples belong to, so a `pollInbound` after it resolves delivers them.
