---
'@jsprismarine/prismarine': minor
---

Give behavior pack scripts more of a level. An entity's rotation, head location and a player's sneaking, game mode and held hotbar slot reach `Entity` and `Player`, and setting `selectedSlotIndex` moves the player's hand and tells their client. A chest minecart, or any other entity whose `minecraft:inventory` declares a container, has an inventory a script reads and fills, and `Entity.applyDamage` hurts an entity through the damage pipeline. `/scriptevent` runs from the console and from a player, as on Bedrock Dedicated Server.

The server raises two new events beside `entityDeath`: `entitySpawn`, once an entity enters its world with why it did, and `entityHurt`, once a blow has landed, with the damage after the grace period. The level's scripts hear them as `world.afterEvents.entitySpawn`, `entityHurt` and `entityDie`.
