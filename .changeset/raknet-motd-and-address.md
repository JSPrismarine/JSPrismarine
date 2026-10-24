---
'@jsprismarine/raknet': patch
---

`UnconnectedPong` now carries the full MOTD line a Bedrock Dedicated Server broadcasts: the
flag field, the IPv4 and IPv6 ports, and the two trailing fields after them. A client reads
the ports to connect to a server it found on the local network, so a line that stopped at the
gamemode appeared in the list but could not be joined from it. `ServerSocket.start` sets the
port from the socket once it has bound.

`Packet.readAddress` and `Packet.readString` now read their unsigned fields unsigned. Both are
written with `writeUnsignedShort`, so a port from 32768 up - the range an operating system
hands a connecting client - decoded as a negative number.
