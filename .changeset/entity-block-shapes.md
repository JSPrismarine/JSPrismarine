---
'@jsprismarine/prismarine': patch
---

Rest dropped items and mobs on a block's real collision shape. Entity physics took every block that collides as a full cube, so an item floated a block up on a slab, a carpet or snow, and landed on a fence at its cell's top rather than half a block above it. Items and mobs now collide with the boxes of each block's `minecraft:collision_box`. A walking mob steps up onto a ledge as high as 0.6 blocks, as Java's step height does, instead of jumping onto every slab and carpet.
