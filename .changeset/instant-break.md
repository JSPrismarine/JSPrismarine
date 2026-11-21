---
'@jsprismarine/prismarine': patch
---

Break a block on the tick it is hit when one tick of mining progress is a whole block, as Java does for leaves under a hoe or bamboo under a sword, and count break ticks in Java's float arithmetic through the new `Block.getBreakTicks`. The server used to take a tick, or two, longer.
