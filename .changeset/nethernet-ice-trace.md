---
'@jsprismarine/nethernet': minor
---

`tracePeerConnection` reports a peer that ends before it connects with how far ICE got, so the log tells an answer the client could not reach from a handshake that stalled after the two sides found each other. `DriverPeer` gains `iceState` and `onIceStateChange`, which a driver of your own must implement, and the package exports `IceState`.
