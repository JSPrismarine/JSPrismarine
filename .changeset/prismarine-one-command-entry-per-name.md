---
'@jsprismarine/prismarine': patch
---

Send each command to the client once. `CommandManager.getCommandsList()` returned one entry per top-level argument branch, so `AvailableCommandsPacket` carried `tp` four times and `execute`, `ban`, `kick`, `gamemode`, `time`, `debug` and `gamerule` two or three times each, and the client kept whichever copy it read last. Each command is now one entry whose overloads cover every branch, with an empty overload for a command that also runs without arguments.
