---
'@jsprismarine/prismarine': patch
---

Deal mobs fall damage. A living mob now adds up how far it falls and, on landing, takes Java's `LivingEntity.calculateFallDamage`: the fall past its Java `safe_fall_distance` attribute times its `fall_damage_multiplier`, floored, so a camel, a llama or a skeleton horse takes 7 from 20 blocks and a fox 15. Water, climbable blocks, levitation and slow falling end a fall, landing on what breaks a player's fall is free, and the `fallDamage` game rule turns it off. A type whose Java class sets its own safe fall is measured by it, and its pack's fall modifier, such as the camel's -4, no longer applies on top.
