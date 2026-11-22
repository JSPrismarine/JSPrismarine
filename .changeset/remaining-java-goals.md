---
'@jsprismarine/prismarine': patch
'@jsprismarine/bedrock-data': patch
---

The wither fires a wither skull at its target every 40 ticks within 20 blocks, Java's `RangedAttackGoal(this, 1.0, 40, 20.0F)`, where it only flew at it. A wither skeleton given a bow shoots arrows with Java's bow goal and goes back to its sword attack without one, as Java's `AbstractSkeleton.reassessWeaponGoal` swaps them.

The Java goal capture no longer credits a mob with the goals of an ancestor's `registerGoals` that its own `registerGoals` override never calls. Java's camel and camel husk register no goals, and the llama no longer lists `AbstractHorse`'s float, panic and tempt goals a second time.
