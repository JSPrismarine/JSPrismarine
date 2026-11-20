---
'@jsprismarine/native-network': patch
---

`PeerConnection.roundTripTime()` reads the SCTP association's smoothed round trip time, through the library's new `jsp_pc_round_trip_time`. A library built before that call still loads, and its connections answer `undefined`.
