---
'@jsprismarine/prismarine': patch
---

`CommandManager.setScriptCommands` takes the level's name, and no name for the default level, so it no longer needs the world manager: a server without one, such as a test's, threw a `TypeError` when its scripts registered commands.
