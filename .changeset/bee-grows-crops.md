---
'@jsprismarine/entity-goals': patch
'@jsprismarine/prismarine': patch
---

A bee carrying nectar grows the crops, stems, sweet berry bushes and cave vines one and two blocks under it, as Java's `BeeGrowCropGoal` does: only while it has a hive within 48 blocks and is not angry, at most 10 growth steps between two visits to its hive. The goal world gains `javaBlockAt` and `setJavaBlock`, which read and write a block as Java's state.
