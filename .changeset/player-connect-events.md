---
'@jsprismarine/prismarine': patch
---

Post `playerConnect` when a player's session starts and `playerDisconnect` just before it leaves, each once per session. Both events were declared and nothing fired them, so a plugin listening for them never heard of a join or a leave.
