---
"@jsprismarine/prismarine": minor
---

Move the join's packet handlers off the `Server`. `RequestNetworkSettingsHandler`, `LoginHandler` and `ClientToServerHandshakeHandler` run before a connection has a player session. They implement `ConnectionHandler` from `network/handler/ConnectionContext` and take a `ConnectionContext`, which holds the connection, a logger, the settings they read and the services a login uses. `network/handler/ConnectionPacketHandler` is gone, and `takesConnection` moved to `network/handler/ConnectionContext`.

`ResourcePackClientResponseHandler` and `SetLocalPlayerAsInitializedHandler` are synchronous input-lane handlers that take an `InputContext`. Work that still waits, such as the join burst, a kick or the player's entry into its world, goes to `step.defer`. A plugin that calls any of these five `handle` methods directly passes a context.

`createStartGameData` takes the settings and the tick it reads in place of the server, and `joinContentPayloads` takes only the logger levels it writes at.
