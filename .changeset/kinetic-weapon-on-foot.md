---
'@jsprismarine/entity-goals': patch
'@jsprismarine/prismarine': patch
---

Let `minecraft:behavior.use_kinetic_weapon` charge on foot, as Java's `SpearUseGoal` does. The goal started only while its mob rode something; it now starts whenever the mob has a target and its main hand holds an item with `minecraft:kinetic_weapon`, mounted or not, and stops when the spear leaves its hand. A zombie without a spear still leaves its movement to its melee attack. `GoalWorld` gains an optional `itemHasComponent`.
