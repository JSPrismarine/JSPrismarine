---
'@jsprismarine/raknet': patch
---

`Packet.readAddress` and `Packet.writeAddress` now encode and decode IPv6 `SystemAddress` values the way RakNet does (version 6, the Windows `AF_INET6` family, the port, flow info, 16 address bytes, scope id). Before, an IPv6 address decoded as the raw bytes read as UTF-8 text, and writing one produced an IPv4 record of garbage. `InetAddress` now infers version 6 from a colon in the address when no version is given, and `writeAddress` throws on text that is not an address of its version instead of writing junk.
