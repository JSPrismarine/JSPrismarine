---
'@jsprismarine/raknet': patch
---

`ConnectionRequestAccepted` now exposes the `systemIndex` and the twenty `systemAddresses` it decodes, and writes the internal addresses a caller supplies (loopback plus unassigned slots when none are given). The internal address count both it and `NewIncomingConnection` use is exported as `MAXIMUM_NUMBER_OF_INTERNAL_IDS`. Internal addresses of either IP family are now walked correctly, so a dual stack peer's timestamps decode where they are.
