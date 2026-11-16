---
'@jsprismarine/entity-goals': patch
---

Let `minecraft:behavior.ranged_attack` start with a target beyond its attack radius and walk toward it, as Java's `RangedAttackGoal`, `RangedBowAttackGoal` and `RangedCrossbowAttackGoal` do. A skeleton, stray, bogged, pillager, drowned or witch whose target stood farther than `attack_range` used to stand still; it now closes in at its goal speed and holds its ground once the target is inside `attack_radius`.
