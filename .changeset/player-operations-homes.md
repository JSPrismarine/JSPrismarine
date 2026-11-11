---
"@jsprismarine/prismarine": minor
---

A player's operations now have homes outside `Player`: the client operations in its `PlayerSession`, and the simulation in its world's `EntityRuntime`. Every `Player` method keeps working and calls the new home.

- `PlayerSession` gains `completeSpawn`, `announceSettings` (what `Player.sendSettings` sends), `getJoinSpawn` and `setJoinSpawn`, `sendInitialSpawnChunks`, `sendGameTypeChange` and `sendAbilityChange` (the sends of a game mode change), and `sendDeathScreen`.
- `EntityRuntime` gains the inputs that take a `StorePlayer`: `setPlayerMining`, `beginPlayerMeal`, `cancelPlayerMeal`, `setPlayerSprinting`, `setPlayerSneaking`, `setPlayerGamemode`, `setPlayerFlying`, `exhaustPlayer`, `playerJumped` and `revivePlayer`, with `entityOfPlayer` and the `PlayerInputTarget` type. `PlayerSystems` gains `setGamemode` and `setFlying`.
- `chatRecipientOf` in `chat/ChatManager` builds a player's chat recipient from its entity id and identity. Each line goes to the session the session registry finds under that id.
- Breaking: `playerRecordOf` in `world/playerRecord` takes the record source, a `KeyedPlayer` and the dimension, and `LivePlayerRecordSource` is gone. `World.savePlayerData` takes any record source with a name and an XUID, a `StorePlayer` among them, and keys the record and the services itself.

Nothing a player sees changes.
