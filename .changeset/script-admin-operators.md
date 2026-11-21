---
'@jsprismarine/script-host': patch
'@jsprismarine/prismarine': patch
---

`@minecraft/server-admin`'s `opPlayer`, `deopPlayer` and `kickPlayer` make a player an operator, stop them being one, and disconnect them, as on Bedrock Dedicated Server: a second `opPlayer` throws `PlayerAlreadyOpError`, a missing player throws `InvalidArgumentError`, and a simulated player's op is not written to `ops.json`, where a kick leaves it in the world. `ScriptAdminServer` gains `isOperator`, `setOperator` and `kick`, and `PermissionManager.setOpNow` takes `{ persist: false }`. Closes #3634.
