---
'@jsprismarine/prismarine': patch
---

Leave a block a cave carver reaches where the aquifer keeps it as a barrier, as Java 26.3's `applyCarvingMask` does. The carver used to open it into cave air, so caves had holes in the stone walls Java keeps between an underground lake and a dry tunnel. Generated chunks change where a carver met a barrier, and terrain cache records written before miss once.
