---
'@jsprismarine/entity-goals': patch
---

The melee goals (`melee_attack`, `melee_box_attack`, `delayed_attack`) start and continue as Java's `MeleeAttackGoal` does. Without `track_target` a goal runs while its walk does instead of asking about sight, and it starts only with a route to the target or the target already in reach, checking at most every 20 game ticks. A chasing zombie no longer stops and restarts its goal, and drops its path, every selector pass against a target it holds from beyond its follow range. The navigator hands the route a `canReach` check found to the next `moveTo` from the same block, so a start costs one path search.
