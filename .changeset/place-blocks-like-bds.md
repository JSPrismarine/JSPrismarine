---
'@jsprismarine/prismarine': minor
---

Place blocks the way a Bedrock Dedicated Server 1.26.52 does. A placed block now replaces what
Java's `#minecraft:replaceable` tag lists, such as leaf litter, short grass and a snow layer. It used
to go on top of that block while the client drew it in that block's place. A survival or adventure
player's stack loses the placed block and keeps its stack network id, and the client is sent its
inventory after each placement. A refused placement, onto a taken face or above the world, sends
back the blocks and the inventory as they are, so no predicted block stays on screen. `placed_block`
advancements now fire for every placement.

Breaking: `World.useItemOn` is gone. It ran after the content path declined a click, and it wrote
the block without checking what stood there, so a placement the content path refused overwrote the
block anyway. Every click on a block now goes through `useItemOnBlock`. `World.resendBlock` is new:
it sends the players who can see a block what is there, without changing it.
