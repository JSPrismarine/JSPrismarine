---
'@jsprismarine/prismarine': patch
---

A generated chunk now carries Java's post-processing marks into the world, and the world settles each marked block against its neighbors when the chunk enters, as Java's `LevelChunk.postProcessGeneration` does: a structure's torch or ladder whose wall a later piece removed lets go, and a mushroom a feature placed in daylight off mycelium is gone. Structure pieces mark their fences, torches, ladders and iron bars as Java's do. A block on a chunk edge waits until the chunk beside it is loaded. Nothing a settled block writes notifies its neighbors or drops an item.
