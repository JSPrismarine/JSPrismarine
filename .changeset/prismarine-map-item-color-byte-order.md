---
'@jsprismarine/prismarine': patch
---

`ClientboundMapItemDataPacket` now writes a decoration's `Color` and each `Pixels` entry as a little-endian int32 of the packed ARGB value, the byte order the client reads. They were written big-endian, which swapped the alpha and blue channels with the red and green ones.
