---
'@jsprismarine/protocol': patch
---

Add `PlayerVideoCapturePacket` (id 324) with the `PlayerVideoCaptureAction` enum: a start or stop byte, then for a start the `FrameRate` as a little-endian uint32 and the `FilePrefix` string.
