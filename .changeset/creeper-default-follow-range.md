---
'@jsprismarine/prismarine': patch
---

Give an entity that declares no `minecraft:follow_range` Java's default of 16 blocks. A creeper's file declares none, so its line-of-sight checks failed at every distance and its fuse never lit.
