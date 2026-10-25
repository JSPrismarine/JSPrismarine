---
'@jsprismarine/commands': patch
'@jsprismarine/prismarine': patch
---

Let a command fill a container block.

`/loot insert` refused with "this server has no container block entities", which stopped being
true once a chunk started keeping a block's `Items`. The roll goes into the block at the named
position, growing a matching stack before it opens an empty slot, which is Java's
`LootCommand.insertIntoContainer` step for step. A stack that only half fits puts in the half, and
the reported count is the half. The command refuses by position when nothing standing there stores
anything, and refuses when the container is full.

`/replaceitem block <pos> slot.container <n>` is Mojang's other two overloads of a command that
only had the entity pair here, and `/loot replace block` reaches the same slots through Java's
`container.N` spelling. `BLOCK_EQUIPMENT_SLOTS` is the one value Mojang's `BlockEquipmentSlot`
enum holds.

`/replaceitem entity @s slot.enderchest <n>` writes the ender chest, which is a container this
server has always carried for a player and never let a command name.
