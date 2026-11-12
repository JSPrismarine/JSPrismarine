---
"@jsprismarine/prismarine": patch
---

A player's leave takes the player out of the world, the player list and the chat fan-out even when an earlier step throws, and passes the first failure on. A failure there used to skip the rest, which left a session that had forgotten its player among the world's viewers for the life of the process.
