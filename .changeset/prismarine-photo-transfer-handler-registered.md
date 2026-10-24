---
'@jsprismarine/prismarine': patch
---

`PhotoTransferPacket` and `PhotoTransferHandler` are registered. A photo an Education Edition
client sends is decoded and logged at debug level instead of being dropped with a "packet 0x63
isn't implemented" warning.
