---
'@jsprismarine/prismarine': minor
'@jsprismarine/raknet': patch
---

A transport that is enabled and cannot listen now stops the server's start, with an error that names the transport, the port and the cause. A server that used to start with a warning when another program held `server-portv6` or the TCP side of `port` that NetherNet signals on now refuses to start: free the port, or turn the transport off with `enable-raknet` or `enable-nethernet`. LAN discovery and the query port still only warn.

`Networking.start` returns a promise that settles once every transport listens, and `Server.bootstrap` rejects with that error. `RakNetListenerLike` declares the `listening` event its listeners already emit.
