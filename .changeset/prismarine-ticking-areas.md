---
'@jsprismarine/prismarine': patch
'@jsprismarine/commands': patch
---

Add `/tickingarea`. A ticking area's chunks load, stay loaded and tick with no player near, so a mob in one updates. The command and a script's `world.tickingAreaManager` keep their areas apart. Behavior pack scripts now also reach the level's time, spawn, difficulty, game rules, music, light, biomes, explosions, loot tables and fog stacks, and a script's debug shape is drawn only for the players it names.
