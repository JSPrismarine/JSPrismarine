---
'@jsprismarine/prismarine': patch
'@jsprismarine/block-behaviors': patch
---

Fix the review findings on portal travel and the dimension change.

- `PlayerSession.changeWorld` refuses a second change while one is still pending on the
  client's loading screen, and refuses a world of a custom dimension type with an error until a
  real client is seen to accept a `ChangeDimension` with an id of 1000 or more.
  `World.touchPortals` and `DimensionTravel.touch` skip a player with a pending change.
- A player without a spawn of their own is sent `SetSpawnPosition` naming the level's Overworld
  spawn in the Overworld, where `Player.getRespawnPoint` sends them, instead of the spawn of the
  world they stand in.
- `PortalIndex.closest` bounds the search on x and z only, as Java's `PoiManager.getInSquare`
  does, and still picks by squared distance including y.
- `DimensionTravel.touch` awaits `entityPortalEnter` listeners, so an asynchronous listener
  can cancel the contact. `touch` returns a promise.
- A data-driven mob keeps its runtime record through a portal: the destination runtime restores
  the same entity, component groups included, and its body takes the portal cooldown.
- `DimensionTravelRule.respawnBlock` is gone; `RespawnPoint` reads the Java attributes.
- `@jsprismarine/block-behaviors` exports `alongPortalAxis`.
