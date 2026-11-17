---
'@jsprismarine/prismarine': patch
---

A generated chunk now carries Java's post-processing marks into the world, and the world settles each marked block against its neighbors when the chunk enters, as Java's `LevelChunk.postProcessGeneration` does: a structure's torch or ladder whose wall a later piece removed lets go, and a mushroom a feature placed in daylight off mycelium is gone. Structure pieces mark their fences, torches, ladders and iron bars as Java's do. A block on a chunk edge waits until the chunk beside it is loaded. Nothing a settled block writes notifies its neighbors or drops an item.

A pre-1.18 chunk upgraded below y = 0 keeps the ticks and marks generation left in its new floor, and marks the fluids on the seams of its old generation as Java's `Blender.generateBorderTicks` does, so water at the old floor and along an edge facing new terrain flows once the chunk loads.
