---
'@jsprismarine/entity-goals': patch
'@jsprismarine/prismarine': patch
---

Make `minecraft:behavior.hurt_by_target` call nearby mobs of the same type onto the attacker when the goal declares `alert_same_type`, as Java's `HurtByTargetGoal.setAlertOthers` does. A hurt mob alerts each mob of its type within its follow range across and 10 blocks up and down that has no target and shares its owner. The goal used to read `alert_same_type` as a number, so the boolean vanilla files write never turned it on. `GoalWorld` gains `setTargetOf` and `GoalMob` gains `owner`, both optional.
