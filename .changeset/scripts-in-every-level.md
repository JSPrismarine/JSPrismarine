---
'@jsprismarine/prismarine': patch
---

Every level the server loads at startup runs the world's behavior pack scripts in a script runtime of its own, not only the default level. A custom command runs in the scripts of the level it's run in, `/gametest` and `/scriptevent` reach that level's scripts, a form answer reaches the scripts of the player's level, and a custom block or item component's hooks reach the level the block or the item's user is in. `Server.getScripts` takes the level, and the default level's scripts are still what it answers without one. `Server.getScriptSlot` and `CommandManager.setScriptCommands` take the level as an optional argument too. Closes #3235.
