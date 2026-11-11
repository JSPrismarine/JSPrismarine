---
"@jsprismarine/prismarine": minor
---

A `Player` holds the entity it stands in a world as instead of being one. `Player.getBody()` returns that entity, a `LegacyPlayerBody`, which is what `World.getEntity()`, `World.getActor()`, `World.getEntities()`, the entity index and the replicator hold for a player, and what a player's blows, arrows, deaths and entity events name. The game behaves as before.

Breaking: `Player` no longer extends `Human` or `Entity`, so `player instanceof Entity` is false and a player is not an `Entity` or a `WorldActor` to the type checker. Pass `player.getBody()` where entity code takes one. `Player` keeps the entity members callers read, such as `getRuntimeId`, `getPosition`, `getWorld`, `getHealth`, `setHealth`, `damage`, `heal`, the status effects, the portal cooldown, `metadata`, `attributes` and the rotation, and answers them from its body. The rest of the entity surface is the body's, among it `spawnTo`, `despawnFrom`, `getTrackingRange`, `applyKnockback`, `addTag`, `removeTag`, `getPortalTransitionTicks`, `restoreLoggedField` and `restoreLoggedSlot`. A plugin comparing `event.getEntity()` from `entityDamage` or `entityDeath` with a player compares it with `player.getBody()`.
