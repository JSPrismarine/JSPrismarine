---
'@jsprismarine/prismarine': patch
---

Drop no item for a death-loot roll that came to nothing. A creeper's gunpowder or a blaze's rod rolls a count from 0, and the empty stack used to land on the ground as an item of count 0, which nothing could pick up. Java's `Entity.spawnAtLocation` skips an empty stack.
