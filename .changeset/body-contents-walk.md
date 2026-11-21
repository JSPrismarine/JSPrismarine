---
'@jsprismarine/prismarine': patch
---

Walk the blocks an entity's body overlaps once per position for water, lava, powder snow and cobwebs, and keep the answer while the body stands still and no block changes. The cold and the cobweb each walked the body's blocks every tick on their own, past the navigation view's memo. A world's block write version now also moves when a chunk enters or leaves memory.
