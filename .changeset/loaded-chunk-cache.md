---
'@jsprismarine/prismarine': patch
---

Remember the last chunk `World.getLoadedChunk` answered with. The callers ask in runs - the light
engine scans a column of 384 blocks through it, and a path finder reads a few hundred positions
around one point - and each ask was a map lookup. A profile of a start region preload put the
lookup at 16% of its self time, and a profile of the entity tick with real mobs put it at 15%.
The cache is one entry and is dropped whenever a chunk is loaded.
