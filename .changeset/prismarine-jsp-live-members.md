---
'@jsprismarine/prismarine': patch
---

Behavior pack scripts that import `@jsprismarine/server` get `performance`, `getPing` and `bossBars`. `performance` reads the server's ticks per second, their 1, 5 and 15 minute averages, the last tick's milliseconds and the smoothed tick milliseconds. `getPing(player)` gives the player's round trip time from their transport, or `undefined` before it has measured one. `bossBars.show` puts a bar on the player's screen, bound to their own entity; with bars from several packs the player sees the one shown last. `Server.getLastTickMs()` and `ClientConnection.getRoundTripTime()` are new, transports may give a `roundTripTime()`, and `BossBar.setColor()` recolors a bar.
