---
'@jsprismarine/prismarine': minor
'@jsprismarine/script-host': patch
---

Behavior packs listed in `content-world-packs` now run their `@minecraft/server` scripts, when the script host is installed and built for the machine (Linux x64 for now). Each pack runs in a QuickJS context of its own in the default level's runtime, with the version 1 and version 2 lifecycles, `system.run`, `runTimeout` and `runInterval`, the `weatherChange` events, `world.sendMessage`, `world.getDimension` and `Dimension.setWeather`, in the order Bedrock Dedicated Server runs them. `config/` beside the server holds BDS's `permissions.json`, `variables.json` and `secrets.json`. The new optional `script-watchdog-enable-shutdown`, `script-watchdog-hang-threshold` and `script-watchdog-memory-limit` settings take BDS's names and defaults; the hang threshold is converted to a count of steps, so a script stops at the same point on every machine.

`/reload` now reloads the behavior pack scripts, as on BDS, and the server keeps running. It no longer disables and re-enables the whole server; restart the server to reload everything else.

Weather changes now go through a guard stage, which a script's `world.beforeEvents.weatherChange` can cancel or change, and `WorldWeather.onChange` hears every change.
