---
'@jsprismarine/item-behaviors': patch
'@jsprismarine/entity-goals': patch
'@jsprismarine/prismarine': patch
---

Steer a pig or strider only while its rider holds a carrot or warped fungus on a stick, as Java's `getControllingPassenger` does: `controlled_by_player` now leaves a mob whose rider holds nothing to its own goals. Using the item boosts the mount the rider steers for Java's 140 plus up to 840 ticks, refuses a second boost while one runs, and costs Java's durability only when the boost takes: 7 for a carrot on a stick, 1 for a warped fungus on a stick, which becomes a fishing rod once worn out. The item world gains an optional `boostMount` query for it.
