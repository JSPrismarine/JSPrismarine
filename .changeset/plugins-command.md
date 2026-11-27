---
'@jsprismarine/prismarine': patch
---

Add `/plugins`, with the `/pl` alias, which lists the installed addons in Paper's layout: the count, then each kind of extension under its own heading. Every player may run it, as on Spigot and Paper, through the `jsprismarine.command.plugins` node the default `permissions.json` already grants. `Server.getPlugins()` returns a `PluginRegistry` that `/plugins` and query's `plugins` field both read, so a future loader for another kind of extension registers a `PluginSource` and both list it. Query now lists the addons sorted by name.
