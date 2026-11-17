---
'@jsprismarine/entities': patch
---

`minecraft:knockback_resistance` now holds values down to -2, the bottom of Java's range. The attribute stopped at 0, so a bouncy or sticky sulfur cube lost the -2 its archetype declares and took a normal push instead of three times one.
