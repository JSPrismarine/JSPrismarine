---
'@jsprismarine/prismarine': patch
---

`/tps` now reports the TPS averaged over the last 1, 5 and 15 minutes, in Spigot's format: `TPS from last 1m, 5m, 15m: 20.0, 20.0, 20.0`, each figure green, yellow or red by health. `Server.getTPSAverages()` returns the three averages.
