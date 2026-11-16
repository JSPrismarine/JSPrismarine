---
'@jsprismarine/entity-goals': patch
---

`minecraft:behavior.hurt_by_target` reads `alert_filters`, the server's own key, for the other mobs `alert_same_type` calls onto the attacker. `javaGoalBody` writes it from the subclasses Java's `alertOthers` finds, so a hurt zombie calls nearby husks, drowned and zombie villagers, but not zombified piglins.
