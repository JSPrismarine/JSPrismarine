---
'@jsprismarine/prismarine': patch
'@jsprismarine/commands': patch
---

`/help` lists only the commands a player may run. The page list, `/help <command>` and the subcommands and forms it shows leave out every command the player's permission nodes or level refuse, and `/help op` for a player who may not run `/op` answers as it does for an unknown command. The console still sees every command. `CommandHost.server.usage` takes the source that asked as an optional second argument, and `CommandManager.usageLines` takes it too.
