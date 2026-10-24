---
'@jsprismarine/protocol': patch
---

Add `ClientboundUpdateSoundDataPacket` (id 348): `Server Sound Handle` as a little-endian uint64, then seven update slots, each a varuint32 alternative index (`Stop`, `SetVolume`, `SetPitch`, `Fade`, `SeekTo`, `Pause`, `Resume`) followed by that alternative's float32 fields.
