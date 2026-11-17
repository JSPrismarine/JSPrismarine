---
'@jsprismarine/prismarine': patch
---

A mob's melee blow now pushes its target back as Java's `LivingEntity.knockback` does: 0.4 away from the attacker, less the target's knockback resistance, lifting a target on the ground to at most 0.4. A ravager or warden adds half its Java `attack_knockback` the way it faces and slows itself, and an adult hoglin or zoglin throws its target by `HoglinBase.throwTarget`.
