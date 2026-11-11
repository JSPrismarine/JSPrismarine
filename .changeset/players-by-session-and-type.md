---
"@jsprismarine/prismarine": minor
---

The server finds a player through its session by entity id, or tells one apart by its entity type, instead of testing for the `Player` class. Portal travel, the PvP game rule, the command host, the item actor port, villager trading and the world's tick do this now. What reaches clients is unchanged.

A player enters a world through `World.addPlayer(player)` and leaves through `World.removePlayer(player)`. Entity runtime ids come from `entityIds` in `entity/entityIds`, which the legacy entities and every world's entity store share. `portalCooldownOf` clamps a portal cooldown to whole ticks.

Breaking:

- `World.addEntity` no longer files a player in the world's player map, so `World.viewerOf` and `World.getViewers` do not find a player added that way. Add a player with `World.addPlayer`.
- `Entity.runtimeIdCount` is removed. Draw an id with `entityIds.next()`.
- `EYE_HEIGHT` and `eyePositionAt` moved from `entity/Human` to `entity/playerEyes`.
