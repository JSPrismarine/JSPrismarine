---
'@jsprismarine/worldgen': patch
---

Carving reuses a source chunk's cave and canyon walks across the chunks around it while they stay cached: `CarverStarts` gains an optional `plansAt`, which records each started carver's ellipsoids as a `CarvePlan` and keeps it within a 16 MiB budget, and `CarvePlan.replay` carves one chunk from it, ending a tunnel where it can no longer reach the chunk. A `CarverStarts` with only `at` still works. The carved blocks are the same.
