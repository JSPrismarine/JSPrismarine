---
'@jsprismarine/script-host': patch
---

Give the world and system members of `@minecraft/server` behavior: the world's time of day, day, moon phase, default spawn, difficulty, cheats, music and every game rule; `system.sendScriptEvent`, `waitTicks`, `isEditorWorld` and `serverSystemInfo`; a dimension's block writes, block searches, block and entity rays, light, biomes, spawned items and experience, explosions, fills, block queries and clones; `BiomeTypes`; `world.tickingAreaManager`; `world.primitiveShapesManager` with `TextPrimitive`, drawn through the debug drawer every pack now has; the loot table manager with every loot table, pool, entry, function and condition class; the overworld clock and its time markers; `LinearSpline`, `CatmullRomSpline` and `Trigger`; and a player's `fogSettings`. Values and errors follow the pinned Bedrock Dedicated Server.

`ScriptWorld` gains an optional `worldSystem` seam, and a debug shape optional `visibleTo`, `hiddenFrom` and `defaultVisibleToAll`.
