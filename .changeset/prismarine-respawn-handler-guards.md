---
'@jsprismarine/prismarine': patch
---

`RespawnHandler` drops a `RespawnPacket` that names another player's runtime id, and answers `ClientReadyToSpawn` with the world spawn while the player is still dead instead of the position they died at.
