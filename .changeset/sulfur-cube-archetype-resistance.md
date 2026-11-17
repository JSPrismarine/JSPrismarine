---
'@jsprismarine/entities': patch
---

A sulfur cube that swallowed a block now keeps its archetype's knockback resistance, such as the slow bouncy archetype's 0.4 or the bouncy one's -2. Java's base of 0 replaced the value each archetype group declares, where Java's own cube adds the archetype's attribute modifiers on top of it. `JAVA_STATE_STATS` now lists the twelve archetype groups.
