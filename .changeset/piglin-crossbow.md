---
'@jsprismarine/entity-brains': patch
'@jsprismarine/prismarine': patch
---

Let a piglin fire its crossbow. A piglin holding a crossbow now charges it for 25 ticks, holds the charge for 20 to 39 more and fires an arrow at a target within 8 blocks, stops closing in once the target is within 7, and no longer swings at it. `BrainMob` gains an optional `performRangedAttack`, and `isWithinAttackRange` is Java's `BehaviorUtils.isWithinAttackRange`.
