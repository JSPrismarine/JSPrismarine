---
'@jsprismarine/protocol': minor
'@jsprismarine/prismarine': minor
'@jsprismarine/raknet': minor
---

Move protocol codec construction, packet lookup, version metadata, and handshake filtering into
`@jsprismarine/protocol`. Prismarine now passes captured item, block, and world data through
`ProtocolContext`, and no longer re-exports the Protocol namespace, packet barrel, or identifier
compatibility API. Server packet dispatch is held by `PacketHandlerRegistry`, and Prismarine
declares the Brigadier dependency its command source and public declarations import.

`ServerName` now receives protocol metadata directly instead of reading `getIdentifiers()` from
the Prismarine server object.
