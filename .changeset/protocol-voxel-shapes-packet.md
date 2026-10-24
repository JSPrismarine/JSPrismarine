---
'@jsprismarine/protocol': patch
---

Add `VoxelShapesPacket` (id 337) and the `SerializableVoxelShape` structure: the block collision shape registry a server sends before `StartGamePacket`, as a shape list, a name-to-handle map and a custom shape count.
