---
'@jsprismarine/nethernet': minor
'@jsprismarine/prismarine': minor
'@jsprismarine/client': minor
---

NetherNet runs on our own implementation of the protocol over libdatachannel, the native WebRTC library in `@jsprismarine/native-network`, and no longer depends on the npm `nethernet` package, werift or `protodef`.

`@jsprismarine/nethernet` adds `NetherNetServer`, `NetherNetClient`, `Connection` with NetherNet's segmentation, `LanDiscovery` and the discovery packet codecs, `SignalStructure` with `SignalType` and `ErrorCode`, and the `WebRtcDriver` interface with `loadNativeDriver`. `adaptPeerConnections` and `constrainIcePorts` are removed, and `tracePeerConnection` takes a driver peer. `HttpSignaling`'s answerer is a `NetherNetServer`.

The server's start stops when the native library cannot load with NetherNet on, and says that `"enable-nethernet": false` runs it on RakNet alone. `jsp-client --latency` and `--loss` work over RakNet only until the client relay lands.
