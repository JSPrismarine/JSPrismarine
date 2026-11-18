---
'@jsprismarine/prismarine': minor
---

Give behavior pack scripts structures, equipment, attributes and clicks. A level keeps the structures its scripts copy and place for as long as it is loaded. A script reads and writes what a player wears and holds, and the health, movement and other attributes of any entity, as 32-bit floats as BDS keeps them. `DimensionTypes` lists the level's dimension types in the order of their ids, `EffectTypes` the status effects the server numbers, and `Player.spawnParticle` sends a particle to one player.

The server raises four new events. `playerInteractBlock` comes before a player's click on a block and can cancel it, which opens, uses and places nothing, and `playerBlockInteracted` follows a click that did something; `playerInteractEntity` and `playerEntityInteracted` do the same for a click on an entity. The level's scripts hear them as `world.beforeEvents` and `world.afterEvents` `playerInteractWithBlock` and `playerInteractWithEntity`.
