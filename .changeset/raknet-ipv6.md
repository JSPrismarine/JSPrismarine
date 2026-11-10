---
'@jsprismarine/raknet': patch
---

`ServerSocket` and `WorkerServerSocket` listen on IPv6 when `start` is given an IPv6 address, on an IPv6-only socket, so a server can run one listener per family. `ServerName` advertises the IPv6 socket's port in the pong's IPv6 port field (`getPortV6`/`setPortV6`, 19133 until a socket binds), and two sockets sharing one `ServerName` share its guid. A socket that cannot bind its port now emits `error` and stops, and a worker whose socket cannot bind rejects `waitUntilReady` and emits `error` to a listener.
