---
'@jsprismarine/entity-goals': patch
'@jsprismarine/prismarine': patch
---

A bee wanders as Java's `Bee$BeeWanderGoal` does: no home radius holds it, and once it is 24 blocks from its hive its hover wander heads back toward the hive. `minecraft:behavior.random_hover` takes a `home_steer_distance` key for that, and `Navigator.randomTarget` takes a filter that refuses a candidate before the path finder sees it.
