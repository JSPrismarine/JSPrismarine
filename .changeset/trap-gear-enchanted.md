---
'@jsprismarine/entity-goals': patch
'@jsprismarine/prismarine': patch
---

A skeleton horse trap's skeletons carry an enchanted bow and helmet, drawn from the `mob_spawn_equipment` enchantment provider as Java's `SkeletonTrapGoal` does through `EnchantmentHelper.enchantItemFromProvider`: a cost from 5 up to 22 by the regional difficulty, then the enchanting table's draw. A goal's spawn options take `enchantFromProvider` for the slots to enchant.
