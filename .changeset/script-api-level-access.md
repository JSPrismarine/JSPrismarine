---
'@jsprismarine/prismarine': patch
---

Behavior pack scripts now read and change the level's entities, players, blocks and items, and run commands. A script's `spawnEntity`, `teleport`, `kill` and block writes go through the same verbs and setters as `/summon`, `/teleport`, `/kill` and `/setblock`, a player's inventory is their session's, and `Dimension.runCommand` and `Entity.runCommand` run a command at once and return its success count. `/scriptevent` run by a script raises `system.afterEvents.scriptEventReceive`. The scripts hear players join, spawn and leave, and the server now posts `playerDespawn` while a leaving player's entity is still in the world, which `world.beforeEvents.playerLeave` reads.

`CommandManager.getHost` returns the command host, and `CommandManager.runScriptCommand` runs a command synchronously at the game directors' level and returns its success count or its error.
