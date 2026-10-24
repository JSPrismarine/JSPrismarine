---
'@jsprismarine/protocol': patch
---

Add `CreatePhotoPacket` (id 171), the Education Edition request to turn a portfolio photo into a photo item: `Raw ID` as a little-endian uint64, then the `Photo Name` and `Photo Item Name` strings.
