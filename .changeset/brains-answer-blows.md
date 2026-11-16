---
'@jsprismarine/entity-brains': patch
---

Brain mobs now answer a blow. `BrainMobDefinition` gains `wasHurtBy`, Java's brain side of `hurtServer`, and `targetFromBrain`, set for the eight types whose Java class reads its target from the brain. A hurt hoglin, piglin, piglin brute or zoglin turns on its attacker as Java's `HoglinAi`, `PiglinAi`, `PiglinBruteAi` and `Zoglin` do, and hoglins and piglins pass the target to their kin. A warden grows angry at what hits it, goes for a direct attacker, takes in vibrations through `wardenHearsVibration` and ages its anger every 20 ticks. `BrainWorld` gains the optional `brainMobOf` and `entityById` lookups, and a piglin's grudge now lasts until its target dies instead of ending whenever the target leaves its senses.
