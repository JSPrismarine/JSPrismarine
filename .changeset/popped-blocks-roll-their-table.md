---
'@jsprismarine/block-behaviors': patch
'@jsprismarine/prismarine': patch
---

Send the last two drops that bypassed it through the one destruction path.

`EntityRuntime.breakBlock`, which is how a mob harvests, wrote air and then rolled the block's
table with no tool, no position and no level view. It was the last of the four drop mechanisms
that were consolidated: a chest a villager harvested over kept what it held, and every table
condition that reads where the break happened refused. It now calls the host's `destroyBlock`
first and writes air afterwards, and keeps the bare roll as the fallback for a host with no live
world behind it.

`rules/support.ts`'s `popBlock` dropped one of the block it popped, which is a guess: deepslate
yields cobbled deepslate, a popped crop yields its seeds, and a block with no table yields
nothing. On the player path `blockBreak.ts` reconciles that stand-in through `spilledContents`,
but a piston's popped block, a block that lost its support and a block a falling anvil cleared
out of the way all went straight to the ground with it.

`WorldActions` gains an optional `destroyBlock`, which the server fills from the same path, so
those three raise the block's `onBreak` and roll Java's table. The self-drop stays as the answer
for a world with no tables behind it, which is the test voxel world. The seam runs
`ContentBlockAccess.destroy`, `BlockStorageAccess.destroy` and `worldBlockStorage`, all optional
for the same reason: only a storage over a live world can tell a family's own drops apart from
the table's roll.
