---
'@jsprismarine/engine-systems': patch
'@jsprismarine/prismarine': patch
---

Hold a fluid tick in a chunk whose neighbors are not all loaded until they are, as Java holds the ticks of a chunk that is not ticking, so water at the edge of the loaded area flows into the next chunk once it loads instead of stopping for good. `TickList.tick` and `TickScheduler.tick` take an optional check of which chunks may tick.
