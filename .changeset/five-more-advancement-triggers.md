---
'@jsprismarine/prismarine': patch
---

Fire five more advancement triggers, taking the count from 12 of 58 to 17. Each is raised from the
place that knows the event rather than from a helper nothing calls.

`consume_item` comes from the `feed` action in the item actor port, which is where
`minecraft:consumable` lands. It is the whole of `husbandry/root`, whose single criterion has no
conditions at all, so the first thing a player eats opens that branch of the tree.

`item_durability_changed` comes from the `consume-durability` action beside it, reporting the
durability left and the amount lost.

`any_block_use`, `default_block_use` and `item_used_on_block` come from `useItemOnBlock`.
`any_block_use` is raised for every interaction with a block, `default_block_use` only when the
block's own behavior or its screen took the click, and `item_used_on_block` when the item in hand
did, which is the one of the three whose conditions see the tool.

The remaining 41 have no call site because the subsystem that would know the event does not exist:
no status effects, brewing, beacons, fishing, breeding, taming, riding, trading, shearing,
sleeping, recipe book or container loot generation.
