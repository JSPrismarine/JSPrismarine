---
'@jsprismarine/prismarine': patch
'@jsprismarine/item-behaviors': patch
---

A raised shield now blocks blows, as Java's `LivingEntity.applyItemBlocking` does. A player who has sneaked for the shield's block delay with a `minecraft:blocks_attacks` item in a hand turns aside a blow from up to 90 degrees off its look, as the item's damage reductions and `bypassed_by` say. The shield wears by its `item_damage`, a weapon with `disable_blocking_for_seconds` such as an axe disables it, and a blow it took whole pushes nothing. A blocked ravager runs its `minecraft:ravager_blocked`: half the time it is stunned, and otherwise it throws the defender by Java's `Ravager.strongKnockback`. `EntityHostFacts` gains `handsOf` and `wearHeldItem`, which the live host answers from a store player's inventory, and `shieldDurabilityCost` also takes an item type.
