---
'@jsprismarine/prismarine': patch
---

Extract the network transport seam: RakNet is wrapped behind a `Transport`/`TransportConnection` interface, connection and packet routing move from inline `Server.bootstrap` closures into a tested `NetworkDispatcher`, and `MinecraftSession` depends on the transport connection instead of the RakNet session. Behavior on the wire is unchanged.
