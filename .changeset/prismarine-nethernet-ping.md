---
'@jsprismarine/prismarine': patch
---

NetherNet players have a round trip time, so `getPing(player)` in `@jsprismarine/server` answers for them as it does for RakNet players, and the TPS bar shows their ping. `NetherNetTransportConnection.roundTripTime()` reads SCTP's smoothed round trip time under the data channels (#3337).
