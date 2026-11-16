---
'@jsprismarine/prismarine': patch
'@jsprismarine/entity-goals': patch
---

Roll spawn gear at Java's regional difficulty. `ServerContent.equipmentDifficulty` answers `random_regional_difficulty_chance` for the place a mob spawns, from the world's difficulty, time and moon, so a fresh world's zombies and skeletons spawn without armor. Chunk inhabited time is not tracked yet (#3168). A drowned's nautilus shell now goes to its off hand.

A pickup goal with `pickup_based_on_chance` now asks `GoalWorld.canPickUpLoot`, which the runtime rolls once per mob as Java's `Zombie.finalizeSpawn` does (`0.55` times the special multiplier) and saves, so a zombie in a fresh region never picks up items. A host without it keeps the per-attempt chance.
