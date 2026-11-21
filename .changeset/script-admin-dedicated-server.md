---
'@jsprismarine/script-host': patch
'@jsprismarine/prismarine': patch
---

`@minecraft/server-admin`'s `dedicatedServer.stopServer` stops the server, `reloadPermissions` reads the permission files again, `reloadScriptingConfig` reads the `config/` folder again so `variables` and `secrets` see the files as they are now, and `reloadCDNConfig` returns, as on Bedrock Dedicated Server. `WorldScripts` takes the server they reach as `admin`, a `ScriptAdminServer`, and `ScriptConfig` gains an optional `reload`. Closes #3635.
