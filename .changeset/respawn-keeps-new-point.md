---
"@jsprismarine/prismarine": patch
---

A respawn search that finds the player's bed gone clears the spawn point only when the player still holds that point. A point set while the search waited for its chunks used to be cleared in its place. `RespawnAnswer` carries the spawn point the search examined as `spawnPoint`.
