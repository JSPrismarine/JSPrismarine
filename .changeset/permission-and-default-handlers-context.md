---
"@jsprismarine/prismarine": minor
---

`RequestPermissionsHandler` and `SetDefaultGameTypeHandler` take the narrow handler context in place of the `Server` and the session, and apply synchronously in the input step. An operator change from the client goes through `PermissionManager.setOpNow`, which changes the list in memory before it returns and writes `ops.json` afterwards; writes run one at a time. `Config.setGamemode` changes the default at once and, when it commits, writes the config file on a later turn of the event loop. It now returns a promise that settles once the file holds the value, and `Config.disable` waits for queued writes.
