---
'@jsprismarine/prismarine': minor
---

Move dropped items the way a Bedrock Dedicated Server 1.26.52 does. A block's drop appears at a
random spot in the middle of the block and leaves with a push of up to 0.1 a tick sideways and 0.2
upward, and the client is told that speed when the item appears. Each tick an item gains BDS's
gravity, moves, then slows by BDS's air and ground drag, so it slides and stops against a wall. Its
position is 0.125 above where it lies, as BDS reports it. Stacks merge within half a block, as on
BDS, instead of a block and a half. Drops from explosions, from falling blocks with nowhere to land
and from block and entity behaviors pop out of their block the same way.

`World.dropFromBlock` is new and puts a block's drops on the ground that way. The item entity takes
a `motion` option and has `getMotion`. Breaking: `DestroyWorld` asks for `dropFromBlock` instead of
`dropContents`.
