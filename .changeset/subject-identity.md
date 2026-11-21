---
'@jsprismarine/prismarine': minor
---

Key operators and bans by who a player is on their platform rather than by the login UUID. A `Subject` is an Xbox account by XUID when the server verified the login against Xbox Live, an offline player by name otherwise, or a Java account by UUID once a Java transport exists; `PlayerIdentity` carries it and `PermissionManager.isOp` and `BanManager.isBanned` take it. Entries in `ops.json` and `banned-players.json` now carry `kind` and `id`. An operator entry written before this keeps its `uuid` until a login with that UUID claims it, and a ban with a name alone bans every player of that name until one logs in and the entry takes their `kind` and `id`.
