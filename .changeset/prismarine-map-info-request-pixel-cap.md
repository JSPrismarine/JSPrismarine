---
'@jsprismarine/prismarine': patch
---

`MapInfoRequestPacket` rejects a `Client Pixels List` count above the 16384 pixels the docs allow before reading any entry, and exports that limit as `MAX_CLIENT_PIXELS`.
