---
'@jsprismarine/prismarine': patch
---

Light reads keep the section they read last until a block write, a storage swap or a chunk entering or leaving memory could change it, and read a block's light properties from a table per palette slot. `World.loadedBlockStorageAt` returns the block layer storage of the section holding a position.
