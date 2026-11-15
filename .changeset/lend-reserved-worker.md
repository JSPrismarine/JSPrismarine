---
'@jsprismarine/chunkgen': patch
'@jsprismarine/prismarine': patch
---

Keep a generation worker clear of background work only while a player is waiting on a chunk. The governor used to reserve one worker permanently, so a server with two workers generated a moving player's surroundings on one of them. A generation pool now holds background work to one worker fewer than it has whenever an `immediate` task is running or waiting, and the governor may give the background every worker otherwise.
