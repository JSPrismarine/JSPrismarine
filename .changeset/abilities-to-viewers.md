---
'@jsprismarine/prismarine': patch
---

A player's `UpdateAbilitiesPacket` now goes only to the clients that track that player, and no longer reaches clients in other worlds that have no actor for it. A client that spawns the player later still gets its abilities with the spawn.
