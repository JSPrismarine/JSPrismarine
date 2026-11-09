---
'@jsprismarine/prismarine': patch
---

The scan for fluid bordering air in a freshly loaded chunk now waits its turn in the chunk completion queue when the chunk is a background request, so a preload no longer runs it as part of every load. A chunk a player is waiting on still runs it at once.
