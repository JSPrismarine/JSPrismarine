---
'@jsprismarine/script-host': patch
'@jsprismarine/script-types': patch
---

`@jsprismarine/server` has three members that reach the running server: `performance`, which reads the server's ticks per second, their averages and how long its ticks take each time a script reads it; `getPing(player)`, a player's round trip time in milliseconds; and `bossBars.show(player, options)`, a boss bar on one player's screen that the pack updates and hides, and that goes away when the player leaves or the scripts stop. The embedder gives them through the new `members` option of `WorldScripts`, and a runtime without it leaves them out. `@jsprismarine/script-types` declares them, with the `Player`, `BossBar`, `BossBarOptions` and `BossBarColor` types they take.
