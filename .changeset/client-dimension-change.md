---
'@jsprismarine/client': patch
---

Decode the dimension change sequence (`ChangeDimension`, `StopSound`, `NetworkChunkPublisherUpdate`, `PlayerAction`, `LevelChunk`, `MovePlayer`) and answer it. `DimensionChange` reports `StartLoadingScreen` with the server's id as the change arrives and `EndLoadingScreen` after the first chunk of the new dimension, so a portal trip on a server finishes. `Client` emits `dimensionChange` when the screen closes.
