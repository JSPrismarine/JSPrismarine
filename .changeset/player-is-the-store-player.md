---
"@jsprismarine/prismarine": minor
---

The `Player` and `Entity` classes are gone. A player is a `StorePlayer` in the entity store, and the player's `PlayerSession` is how plugins and server code act on it.

Breaking:

- The root `Player` export and the `@jsprismarine/prismarine/Player` module are gone, and so are `Entity`, `EntityPositionOptions` and `SpawnableEntityClass` with the `@jsprismarine/prismarine/entity/Entity` module. `DamageCause` is still exported from the package root.
- `PlayerSession.getPlayer()` returns the `StorePlayer`, which holds the player's state: the inventory, the crafting grid, the identity, the position and look, the health, the food, the experience, the game mode, the spawn point and the item use clock. The session holds what the `Player` held beside that: the world the player is in (`getWorld()`), its permissions (`getPermissions()`, `isOp()`), and its lifecycle (`join()` and `leave()` replace `Player.enable()` and `Player.disable()`; `isConnected()` replaces `isOnline()`). The operations that post player events or tell the client moved to the session too: `setGamemode`, `setFlying`, `setSprinting`, `respawn`, `getRespawnPoint`, `setPlayerPosition`, `setWorld`, `kick` and `sendMessage`, which now also takes a bare string. `session.getActor()` is the player's actor while it is in a store; `session.shown()` replaces `Player.getBody()`.
- `SessionManager.getAllPlayers()`, `findPlayer()`, `getPlayerByExactName()` and `getPlayerById()` return store players; `getLegacyPlayers()`, `LegacyPlayers` and `sessionPlayerRefOf` are gone. `World.getPlayers()` is gone; read `World.getViewers()`, which lists the sessions. `World.addPlayer` and `World.removePlayer` take the session.
- `World.addEntity`, `removeEntity`, `getEntity`, `getEntities`, `entityRelocated` and `hasEntityStore` are gone. Every entity is a store entity: read `World.getActor(runtimeId)`, `World.getActors()` or `World.actors()`, which answer `StoreActor`s. The `WorldActor` type is gone; use `StoreActor`.
- The player events' constructors take the `PlayerSession` only.
- `EntityRuntime.all()` is gone; walk `EntityRuntime.entities()`.
- The legacy forms of the keyed services are gone: `enchantmentSeedOf`, `rerollEnchantmentSeed` and `storedAdvancements` take a `KeyedPlayer` (`session.keyed()`), `PlayerKeySource` is a key or a `KeyedPlayer`, `KeyedPlayerSource` and `keyedPlayerOf` are gone, `BanManager.isBanned` takes `{ name }` and `PermissionManager.getPermissions` and `setPermissions` take `{ uuid }`.
- `CommandManager.dispatchCommand`'s target is a `CommandTarget`.
