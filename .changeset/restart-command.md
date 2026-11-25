---
'@jsprismarine/prismarine': patch
'@jsprismarine/server': patch
'@jsprismarine/console-protocol': minor
'@jsprismarine/console': patch
---

The console gets `update check`, which checks for a newer JSPrismarine now, and `restart`, which stops the server and starts it again in a new process. Only the console runs them, unless a player's permission entry names `jsprismarine.command.update` or `jsprismarine.command.restart` itself: an operator's `*` doesn't grant them. `ServerMessage` gains `restart`, which a server sends to ask its host to restart it; the host's supervisor honors it with or without `--watch`. `Server.requestRestart()` sends it and returns false for a server with no host, and `PlayerCommandSender` gains `getPermissions()`.
