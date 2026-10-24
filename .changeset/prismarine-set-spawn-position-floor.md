---
'@jsprismarine/prismarine': patch
---

The join sequence floors a fractional world spawn before writing it into `SetSpawnPositionPacket`, so a spawn at `-0.5` names block `-1` instead of block `0`.
