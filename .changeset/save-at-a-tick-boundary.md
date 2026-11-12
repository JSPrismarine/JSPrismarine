---
'@jsprismarine/prismarine': minor
---

A level saves every dimension in one pass, as the state of one tick boundary (ADR 0018). The autosave's cut runs at the end of `Level.update`: it builds every player record, persists the data entities, takes each chunk's actor records and plans its changed sub chunks. The sub chunks are encoded over the following ticks, a bounded count each tick, and a write that is about to reach one encodes it first with the chunk's `Data3D`, so a write after the cut costs at most one sub chunk. The pass commits as one LevelDB batch through `Database.commit`, off the server thread, and marks each chunk saved as it was at the cut. A crash before the commit leaves the previous save whole. `level.dat` is rewritten once per pass, through a synced rename, where it used to be written in place once per dimension.

`LevelSave` owns a level's writes to its save and queues them, so a chunk the unload pass writes waits for a pending commit, and `PlayerPersistence` writes a record saved after a cut behind that cut's commit. `BaseProvider.beginSavePass` starts a pass (`ProviderSavePass`), which `LevelDB` writes as one batch. `Chunk.persistedStateNow`, `Chunk.markSavedAs` and `Chunk.setSaveCut` let a pass mark a chunk saved as of its cut and hear the writes after it.

`World.saveForReplay` is gone; `Level.captureReplayInitialState` saves through the level. `World.save` and `World.saveChunks` save through the level's pass, `World.stop` stops a world without saving it, and `Level.disable` stops every world and writes them in one pass.
