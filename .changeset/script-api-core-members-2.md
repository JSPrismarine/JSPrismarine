---
'@jsprismarine/script-host': minor
---

Implement the next `@minecraft/server` members the add-on corpus uses most. `World.getEntity` finds an entity by its id, `Dimension.getPlayers` lists a dimension's players, `Entity` reads its rotation, head location, view direction and sneaking and takes `applyDamage`, `Player` reads its game mode and reads and sets `selectedSlotIndex`, and `Container.addItem` fills a container onto matching stacks first and hands back what does not fit. `world.afterEvents.entitySpawn`, `entityHurt` and `entityDie` reach scripts with the cause, the damage and an `EntityDamageSource`. Errors follow the pinned Bedrock Dedicated Server, as the `entity-members`, `entity-events` and `players` parity scenarios recorded.

`ScriptEntityState` gains optional rotation, head location, sneaking, game mode and hotbar slot fields, `ScriptWorld` gains optional `setSelectedSlot` and `applyDamage`, and `ScriptWorldEvent` has the entity events.
