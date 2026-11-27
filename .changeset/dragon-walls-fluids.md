---
'@jsprismarine/entity-goals': patch
'@jsprismarine/block-behaviors': patch
'@jsprismarine/prismarine': patch
---

Leave the fluid behind when the ender dragon breaks through a block, as Java's `EnderDragon.checkWalls` does through `Level.removeBlock`. A waterlogged block, kelp, seagrass or a bubble column becomes a water source, and a water or lava block stays as it is, so it no longer counts as broken. With `mobGriefing` off, a water block is a wall, as in Java.

`GoalWorld.removeBlock` takes a block out the way `Level.removeBlock` does, and the goal world over the entity runtime answers it with the new `removedBlockOf` from `@jsprismarine/block-behaviors/rules/fluid`. `checkDragonWalls` runs Java's `checkWalls` over one box.
