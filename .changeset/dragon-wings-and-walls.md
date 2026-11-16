---
'@jsprismarine/entity-goals': patch
'@jsprismarine/prismarine': patch
---

Run the ender dragon's contact with the world as Java's `EnderDragon.aiStep` does: unless it was hurt in the last 10 ticks, each wing shoves what it meets away from the body and, while the dragon flies, hurts it for 5, and the head and neck hurt what they touch for 10. With `mobGriefing` on, the dragon removes every block its head, neck and body pass through but the `minecraft:dragon_transparent` and `minecraft:dragon_immune` ones, as `checkWalls` does. The goal world gains optional `pushMob` and `blockHasTag`.
