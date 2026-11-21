---
'@jsprismarine/script-host': patch
'@jsprismarine/script-types': patch
'@jsprismarine/prismarine': patch
---

`@jsprismarine/server` has `levels`. `current`, `list()` and `levelOf(player)` describe the server's levels. `transfer`, `create`, `attach` and `detach` move a player to another level and manage levels as `/world` does. Each of the four answers a promise that settles on a script tick after the server finishes.
