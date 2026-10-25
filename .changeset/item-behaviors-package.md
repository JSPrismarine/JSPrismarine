---
'@jsprismarine/item-behaviors': patch
---

Add `@jsprismarine/item-behaviors`, the vanilla item behavior families that fill the seven hooks
`@jsprismarine/items` declares and none of its 122 components implements. A classifier assigns every
one of the 1658 Java items of the pinned 26.3 registry to exactly one of 47 families or to `data
only`, and the counts are asserted rather than claimed: 88 spawn eggs, 82 equippables, 47 entity
placements, 39 foods, 21 block-transforming tools, 18 maps, 17 bundles, 16 banners, 16 dyes, 9
throwables, 7 each of mob buckets, spears, pickaxes and swords, and 1233 items with no item-side
behavior, which are the block items and the plain materials. Where Java's data says what an item is,
the family is recognized by component and the behavior binds wherever that component appears, so a
pack's own food eats with no registration; where neither edition publishes anything to recognize it
by, the family names identifiers.

Behaviors reach the world through `WorldActions`, nine queries and one `perform` over a tagged union
of 28 effects, so the package depends on no server class. `createTestWorld` is the typed double, with
every query a value a test sets, every action in an ordered log and a fixed random sequence.
`registerVanillaItemBehaviors(registry, { world, items })` registers and attaches all 41 behaviors in
one call, in the order `HookTable.dispatchFirst` needs: a potion before the general consumable, the
mace before the melee weapon, the stripping transform before the mining tool.

The mining speed, break progress, attack damage and Unbreaking formulas are transcribed from the
unobfuscated 26.3 server jar (`Player.getDestroySpeed`, `BlockBehaviour.getDestroyProgress`,
`Player.attack`, `Tool.getMiningSpeed`, `RemoveBinomial.process`) and computed in `float` throughout,
checked against 1665 golden vectors the jar itself produced through `utils/oracle/run.mjs`. Tool tier,
Efficiency, Haste, Mining Fatigue and the in-water and off-ground penalties are all in. The README
documents the divergence that matters: the Bedrock client computes its own break time with different
Haste and Mining Fatigue terms, has no attribute to carry `mining_efficiency`, `block_break_speed` or
`submerged_mining_speed`, and `server-authoritative-block-breaking` validates the client's prediction
rather than replacing its timing, so Java's number is the server's figure and the client's timing is
left alone.
