---
'@jsprismarine/prismarine': minor
---

Send a player's block break through the content hooks.

`World.breakBlock` raised no hook, so with the content on a chest broken by a player kept its
contents, a double chest left its other half paired to a position holding air, and the drops were
rolled without the position or the dimension the break happened in.

`world/blockBreak.ts` is the content path for the same break. The block's behavior family gets
`onBreak` before the block goes, which is what spills a container and unpairs a double chest, and
Java's loot table for the block decides what falls, with the breaking player's tool in the roll so
silk touch and fortune apply.

Both halves drop items, so the two are told apart by what the block entity was holding: the table
owns what the block itself yields, and a family drop the block entity did not hold is the family
standing in for the table on a host with no Java half, which the roll replaces. Whether a
container's contents spill at all stays the family's decision, which is how a shulker box keeps
what it holds. A block the stack has no table for keeps the family's own drops.

The path declines whenever `content-packs` is off and for a block the content has no type for, so
a server without content breaks blocks exactly as before. A behavior that throws is logged and the
break falls back to the same drop rather than costing the player the block.
