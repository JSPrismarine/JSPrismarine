---
'@jsprismarine/prismarine': patch
---

Send the login-to-spawn packets in the order a 1.26.51 client accepts.

A retail client at protocol 2193 dropped the connection with `InitialConnection-90` (bad packet) the moment the server logged the join. Four things were wrong with the sequence, none of them visible with the server's own client, which tolerated all of them.

`Player.enable` sent the gamemode, adventure settings, abilities and a `MovePlayer` per player from inside `LoginHandler`, before `PlayStatus(LoginSuccess)`. Nothing but PlayStatus and ResourcePacksInfo leaves the server during login now; the settings go out from the join burst after StartGame, and the MovePlayer is gone because `AddPlayer` already carries each player's position.

The join burst sent three `Respawn` packets, one of them `CLIENT_READY_TO_SPAWN`, a state only a client sends. No vanilla server sends a Respawn at login, so none goes out. `sendRespawn` is unchanged for deaths.

`PlayerList` and `SetTime` went out before `StartGame`. StartGame and the registries come first now, then the player list, time and spawn position, then the local player's settings, attributes, metadata and inventory, then the join message. `JigsawStructureData` stays ahead of StartGame, since a client that reaches StartGame without it disconnects with `MissingStructureData`.

`Player.completeSpawn` ran twice, from the join burst and again when the client reported itself initialized, so the inventory and settings were sent twice. It runs once now, from `SetLocalPlayerAsInitializedHandler`, where the client has rebuilt its local player and needs them again.

`ActorEvent` and `PlayerSkin` were registered packets with no handler, so every one a client sent was logged as a handler error. Both have handlers that accept the packet and log at debug level. Skin changes are still not applied.
