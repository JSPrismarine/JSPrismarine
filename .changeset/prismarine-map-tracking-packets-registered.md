---
'@jsprismarine/prismarine': patch
---

`MapCreateLockedCopyPacket`, `PositionTrackingDBClientRequestPacket` and their handlers are registered, along with `ClientboundMapItemDataPacket` and `PositionTrackingDBServerBroadcastPacket`. Locking a map at a cartography table or holding a lodestone compass no longer makes the server warn that packet 0x83 or 0x9a is not implemented.
