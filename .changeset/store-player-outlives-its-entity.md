---
"@jsprismarine/prismarine": minor
---

A store player outlives its entity. `StorePlayer` is built from the id drawn at the login and an identity, holds its position, look and health while it is in no store, and gets an entity through `enterStore` and gives it up through `leaveStore` (`entity/data/storePlayers`). The constructor no longer takes a `DataEntity`, `StorePlayer.entity` is undefined while the player is in no store, and `PlayerSystems.attach` takes the player's parts and returns where they log.

While its entity is in a store, a store player logs its components, hand slot, carried slots and crafting grid, and the runtime undoes them. Its game mode is the logged component field `abilities.gamemode`, so a creative or spectator store player no longer starves, drowns or takes falls. A store meal counts on the store's tick (`EntityStore.tick`), and a store player ticks outside the ticking chunks.

New: `EntityRuntime.spawnPlayer`, `nextEntityId`, `teleportPlayer` and `onPlayerFailed`, a `prepare` step for `EntityRuntime.restore`, the `PlayerSystems` input calls `setSprinting`, `setSneaking`, `jumped` and `teleported`, `moveStorePlayer`, `StorePlayerActor.showPlayerState`, `storePlayerHostFacts` (`entity/data/playerHostFacts`), `breathWorthSending`, `survivalReaches` and `mayFlyIn`. Live players are still legacy `Player` objects, so nothing changes for them.
