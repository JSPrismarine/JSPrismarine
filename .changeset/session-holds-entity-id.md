---
"@jsprismarine/prismarine": minor
---

A `PlayerSession` holds its player's runtime id and login identity instead of the `Player` object, and finds the player by that id. `PlayerSession.runtimeId` and `PlayerSession.identity` are new, and `SessionManager.getLegacyPlayers()` is the directory sessions find their players in. `createConnectedPlayer` files the player there, and `PlayerSession.disable` forgets it, after which `getPlayer()` throws and `isConnected()` answers false.

Breaking: the `PlayerSession` constructor takes the player's id and identity and the directory, `new PlayerSession(server, connection, { runtimeId, identity }, players)`, instead of the player. Code that builds a session should call `createConnectedPlayer`.
