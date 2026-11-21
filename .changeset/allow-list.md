---
'@jsprismarine/prismarine': patch
'@jsprismarine/script-host': patch
'@jsprismarine/errors': patch
---

The server has an allow list: `allowlist.json` beside `config.json`, in Bedrock Dedicated Server's format, and the `allow-list` setting, which turns away a player who is not on it with "You are not invited to this server." `@minecraft/server-admin`'s `dedicatedServer.allowList` reads and changes it, with BDS's errors. `Server.getAllowList`, the `prismarine:allow-list` module, `ScriptAdminServer.allowList` and the `AllowListNotList` error are new. Closes #3633.
