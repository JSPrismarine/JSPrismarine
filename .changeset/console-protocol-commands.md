---
'@jsprismarine/console-protocol': patch
'@jsprismarine/prismarine': patch
---

A console can ask the server for its commands: a `commands` request answers with `commands.result`, which lists each vanilla command's name, description, aliases and the forms it takes. `CommandManager.commandReference()` builds the list from the same descriptions and syntax `/help` shows.
