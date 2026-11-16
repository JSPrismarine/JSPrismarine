---
'@jsprismarine/entity-goals': patch
---

Scan for attack targets and start leaps on Java's random draws. `nearest_attackable_target` and `defend_trusted_target` scanned on a fixed countdown of `scan_interval` selector ticks; they now scan on one selector tick in half of it, rounded up, as Java's `NearestAttackableTargetGoal` does with its random interval. `defend_village_target` and `wither_target_highest_damage` look every selector tick, as Java's goals do. `leap_at_target` started on a 0.2 chance and now starts on Java's one in three.
