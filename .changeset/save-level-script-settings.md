---
'@jsprismarine/prismarine': patch
---

A level saves its ticking areas, the overworld clock's time markers and pause, `world.allowCheats` and the `playerWaypoints` game rule in its record, as BDS saves them with the world, so they outlast a restart and a `/reload`. `/tickingarea` keeps an area's preload flag with the area and acts on the ticking areas of the level it runs in. `Level.getTickingAreas` and `Level.getScriptSettings` hold them; `tickingAreasOf` is deprecated in favor of `Level.getTickingAreas`. Closes #3316.
