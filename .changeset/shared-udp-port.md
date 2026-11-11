---
'@jsprismarine/raknet': minor
'@jsprismarine/native-network': patch
'@jsprismarine/prismarine': minor
---

RakNet and NetherNet can share one UDP port. When `server-udp-ports` covers `port` or `server-portv6` and both transports are on, the native networking library owns the port, sorts each datagram by its bytes, and hands RakNet its datagrams through shared-memory rings, in socket mode and with the RakNet worker.

`@jsprismarine/raknet` adds `DatagramSource`, with `UdpDatagramSource` and `RingDatagramSource`, and `ServerSocket` and `WorkerServerSocket` take one as a new last constructor argument. `@jsprismarine/native-network`'s `SharedPort.attach` takes the rings to fill instead of allocating them.
