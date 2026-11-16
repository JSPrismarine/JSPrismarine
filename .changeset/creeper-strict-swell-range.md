---
'@jsprismarine/prismarine': patch
---

A creeper lights its fuse only once its target is closer than 3 blocks, as Java's `SwellGoal` checks `distanceToSqr < 9`. A target exactly 3 blocks away no longer lights it.
