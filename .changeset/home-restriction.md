---
'@jsprismarine/entity-goals': patch
'@jsprismarine/prismarine': patch
---

Hold a mob's random wandering to the `restriction_radius` of its `minecraft:home`, as Java's `RandomPos` holds it to the radius `Mob.setHomeTo` gives: while the mob is within the radius plus its wander range plus one block of home, a random stroll, swim, hover or flight refuses a destination outside the radius. `NavigatorContext` gains an optional `homeRestriction`, and `breaksHomeRestriction` is exported. The goals now read the home `minecraft:home` sets, which they never saw, and the save keeps it. A guardian and a creaking, which Java gives no home radius, wander freely.
