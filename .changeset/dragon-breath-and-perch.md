---
'@jsprismarine/prismarine': patch
---

A dragon fireball now leaves a cloud of dragon's breath where it lands, as Java's `DragonFireball.onHit` makes it: radius 3 growing to 7 over 600 ticks, instant damage II at a quarter of its duration, owned by the dragon and centered on the first living thing within 4 blocks. An arrow or trident that hits a perched dragon is set on fire for a second, deals nothing and turns back, as Java's `AbstractDragonSittingPhase.onHurt` and `AbstractArrow.onHitEntity` do.
