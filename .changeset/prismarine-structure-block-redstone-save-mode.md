---
'@jsprismarine/prismarine': patch
---

`StructureBlockUpdatePacket` reads and writes `Redstone Save Mode` as a ZigZag varint32, the compressed integer the 1.26.51 docs describe, instead of a plain byte. A client that picks `SavesToDisk` sends the byte 0x02, which used to decode as 2 rather than 1.
