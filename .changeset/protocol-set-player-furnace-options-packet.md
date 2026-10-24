---
'@jsprismarine/protocol': patch
---

Add `SetPlayerFurnaceOptionsPacket` (id 351): `FurnaceType` as one byte, then `Furnace Options` as `Left Furnace Tab` (ZigZag varint32), `Filtering` (one byte) and `Layout` (ZigZag varint32).
