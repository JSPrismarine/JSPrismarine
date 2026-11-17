---
'@jsprismarine/script-host': minor
---

Implement the `@minecraft/server` members the add-on corpus uses most, in the stable and beta shapes. `world.getAllPlayers` and `getPlayers` with the basic `EntityQueryOptions`, `Dimension.getEntities`, `spawnEntity`, `getBlock` and `runCommand`, `Entity` and `Player` with their id, type, location, dimension, name tag, name, tags, `teleport`, `kill`, `remove`, `runCommand`, `sendMessage` and the inventory's `Container`, `Block` with `setType` and `setPermutation`, `BlockPermutation.resolve`, `getAllStates` and `getState`, and `ItemStack` with its amount, name tag and lore. The player join, spawn and leave events, `world.beforeEvents.playerLeave` and `system.afterEvents.scriptEventReceive` reach scripts. Errors and edge cases follow what the pinned Bedrock Dedicated Server does, as the `scripting.world`, `entities`, `blocks` and `items` parity scenarios recorded.

A script's entity or block is a handle that carries an id or a position, and reads the world each time a member runs; a pack gets one object per entity. `entity.location` costs one host call, since a member that returns plain data passes it as JSON. A value set on a property outside its bounds throws BDS's `PropertyOutOfBoundsError`, and `engine.release` frees a handle a host function returns, which `world.getAllPlayers` used to leave behind.

Breaking for code that embeds the script host: `ScriptWorld` needs the entity, block, item, command and player-leave members, and `ScriptWorldEvent` has the player and script events.
