---
'@jsprismarine/prismarine': patch
---

A world without player storage in its provider writes a player's record whole: a field the new record leaves out, such as a spawn point the player no longer has, is removed from `playerdata/<key>.json` instead of coming back on the next join.
