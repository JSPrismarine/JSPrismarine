---
'@jsprismarine/entity-brains': patch
'@jsprismarine/prismarine': patch
---

Run the tadpole's inherited fish goals beside its brain, as Java's tadpole does. `Tadpole` extends `AbstractFish` without overriding `registerGoals`, so Java runs a panic goal at 1.25, a flight from players within 8 blocks and the fish swim goal on top of `TadpoleAi`. `TADPOLE_BRAIN` now reports `alsoRunsGoals` and carries those goals as Bedrock goal bodies in the new optional `BrainMobDefinition.goals`, exported as `TADPOLE_GOALS`; the server runs exactly them in place of the goals the tadpole's file declares, whose tempt and look goals the brain already covers.
