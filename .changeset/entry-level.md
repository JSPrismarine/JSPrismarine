---
'@jsprismarine/prismarine': minor
---

Commands act on the level they run in. `CommandManager.getHost(level)` answers a host per level, so `/scoreboard`, `/data` storage, `/time`, `/weather`, `/gamerule`, `/tickingarea` and a dimension naming no level read and write the level of the player, entity or script running the command; the console and the datapack functions keep the entry level's. A block's drops roll against the world it broke in, a player without a spawn point respawns in their own level's Overworld, and a level's scripts read its own seed. `WorldManager.getDefaultLevel` and `getDefaultWorld` are now `getEntryLevel` and `getEntryWorld`, and `Block.getDrops` takes the world it broke in.
