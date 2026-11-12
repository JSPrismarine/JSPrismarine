---
"@jsprismarine/prismarine": minor
---

Sessions, replication and worlds find a player's session by entity id instead of holding the `Player`. A client's view distance is its session's state: `PlayerSession.getViewDistance()` reads it, and `PlayerSession.getViewPosition()` and `PlayerSession.getWorld()` answer where the client sees from. `PlayerSession.kick(reason, code)` kicks the client as `Player.kick` does. `World.getViewers()` lists the sessions of a world's online players and `World.viewerOf(runtimeId)` finds one by entity id. `SessionManager.getSessions()`, `SessionManager.sessionOf(runtimeId)` and `SessionManager.findSession({ name, xuid })` look sessions up by the id and identity they hold, and `findPlayer`, `getPlayerByExactName` and `getPlayerById` go through them.

Several parameters take less than a `Player` now, which a `Player` still satisfies: a broadcast's `exclude`, a block sound's listener and `World.hitBlock`'s striker are matched by entity id, and `World.getPlayerData`, `World.dropFromPlayer`, `playerSpawnPositionPacket`, `createStartGameData`, `lastPlayerRecord` and `playerRecordOf` take only what they read. What reaches clients is unchanged.

Breaking:

- `Player.viewDistance` is no longer written and stays zero. Read `PlayerSession.getViewDistance()`.
- `NetworkWorldReplicator.getViewers` returns the recipients' sessions instead of their players.
- `BossBar.players()` returns the subscribers' sessions, and `BossBar.releasePlayer` takes the player's entity id. `addPlayer`, `removePlayer` and `answerQuery` take a session or a player.
