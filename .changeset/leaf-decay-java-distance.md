---
'@jsprismarine/block-behaviors': patch
'@jsprismarine/prismarine': patch
---

Decay leaves at Java's distance and stop a drop burst from taking the server down.

`MAX_LEAF_DISTANCE` was 4, which is Bedrock's rule, and the trees it was applied to are built
from Java's `worldgen/feature` data. `LeavesBlock` in the pinned 26.3 server jar has
`DECAY_DISTANCE` 7 and decays a leaf whose `distance` state has reached it, so 6 is the last
distance that survives; `updateDistance` takes one more than the smallest of the six neighbors',
counting a block in `#minecraft:prevents_nearby_leaf_decay` as 0, and the fixed point of that is
the breadth-first distance from the nearest log through leaves. `TreeFeature.updateLeaves` writes
those distances out to 6 when the tree is generated. The radius-4 rule therefore condemned the
outer rings of every canopy the generator placed: 59 of one chunk's 1173 leaves against the 4
Java condemns, each one a break that rolls for a sapling. Java decides this on its own, and
Bedrock has nowhere to disagree, because all seven of Java's `distance` values collapse onto the
two Bedrock leaf states that differ only in `persistent_bit`.

A position the decay search cannot read now counts as holding the leaf up, which is what
`BlockPhysics` already assumes about ground it cannot read, so a canopy at the edge of the loaded
world no longer decays for want of a chunk. `mushroom_stem` is no longer treated as a log, since
Java leaves it out of `#minecraft:logs`.

`World` now holds at most `ITEM_ENTITY_LIMIT` dropped stacks and turns the rest away with a
warning once a second. Nothing capped this before: one tick is allowed 4096 block updates, every
one of which can destroy a block and roll its loot table, and the reported failure was more than
10,000 item entities falling, merging and broadcasting at once.
