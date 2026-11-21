---
'@jsprismarine/prismarine': patch
---

Fly fireballs, wither skulls and wind charges by Java's `AbstractHurtingProjectile.applyInertia`: each tick they speed up along their heading by `accelerationPower` and keep their inertia's share of the speed before they move, 0.95 for a fireball or a plain wither skull, 0.73 for a dangerous one, 0.8 in water, and 1 with no acceleration for a wind charge.
