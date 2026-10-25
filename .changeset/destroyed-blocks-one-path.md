---
'@jsprismarine/engine-systems': minor
'@jsprismarine/block-behaviors': patch
'@jsprismarine/prismarine': patch
---

Run every destroyed block through one path.

A blast, a stream of water, a piston, fire and a falling block each took blocks out with a rule
of their own, and none of them raised the block's `onBreak`. A chest the TNT caught kept its
contents, a double chest left its other half paired to air, and what fell was a hardcoded copy
of the block rather than Java's loot table.

`WorldAccess` gains `destroyBlock`, which the host answers by running the same path a player's
break takes: the hook before the write, then the roll with whatever the caller knows, the blast
radius for an explosion and nothing at all for a plank the fire burned. It also gains
`moveBlock`, so a pushed block carries its block entity instead of being written twice and
arriving empty. `WorldAccess.spawnItem` is gone with them.

`World` now raises `onNeighborChanged` for every block write rather than only for the content
adapter's own, so a torch whose support a command or a generator removed finally hears about it.
