---
'@jsprismarine/prismarine': patch
---

A portal trip that is dropped no longer leaves a chunk ticket behind. A trip dropped while its destination world was still being built used to take its ticket once the build finished, so those chunks never unloaded. A trip out of the End that was dropped while the respawn search waited kept the search's ticket in the player's name. Both are released now.

`PlayerSession.abandonRespawnPoint`, `RespawnSearch.release` and `ChunkTickets.count` are new.
