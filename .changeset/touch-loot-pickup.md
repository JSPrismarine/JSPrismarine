---
'@jsprismarine/prismarine': patch
---

Mobs pick up the items they touch as Java's `Mob.aiStep` does, whatever goal they are running: a piglin takes and admires gold, eats food and wears armor, a villager gathers the seeds and food Java's `Villager.wantsToPickUp` names whatever its profession, a zombie or skeleton whose spawn roll let it pick up wears a helmet it walks over while it chases a player, and a sulfur cube swallows a block. `mobGriefing` off stops all of it, and a dropped stack's pickup delay holds it back. A fox with something in its mouth no longer takes another item into its inventory.
