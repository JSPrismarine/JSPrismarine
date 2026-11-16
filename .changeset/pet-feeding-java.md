---
'@jsprismarine/entities': patch
'@jsprismarine/prismarine': patch
---

A `minecraft:healable` item with a negative `heal_amount` now hurts the entity by that much instead of doing nothing. A parrot fed a cookie dies at once and is poisoned for 900 ticks, as Java's `Parrot.mobInteract` does. A hurt tamed nautilus fed its food now heals before it breeds, as Java's `AbstractNautilus.mobInteract` does.
