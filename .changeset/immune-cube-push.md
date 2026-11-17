---
'@jsprismarine/prismarine': patch
---

A sulfur cube carrying a block, which takes no damage from a blow, is still pushed by the blow's size, as Java's `SulfurCube.hurtServer` passes the blow to `dealDefaultKnockback`. Its push came out as nothing. `DamageStages.commit` is also passed the intent as it arrived, before a guard replaced its amount.
