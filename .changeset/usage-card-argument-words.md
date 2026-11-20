---
'@jsprismarine/commands': patch
'@jsprismarine/console-protocol': patch
'@jsprismarine/prismarine': patch
'@jsprismarine/console': patch
---

The console's usage card now knows how many words each argument takes, so in `tp @s 0 64` it keeps `<position>` marked through all three coordinates instead of moving on to the next argument. Argument types say how many words they read (`argumentWords`): three for a position, two for a Java rotation or two-dimensional position, and the rest of the line for a message, JSON, NBT or a nested command. `CommandManager.commandReference()` sends a count for each part of each form as `usageWords`, and the console protocol's `CommandInfo` carries it.
