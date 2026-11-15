---
'@jsprismarine/prismarine': patch
---

Record the fluid positions Java ticks after generating a chunk. The noise fill and the carvers mark fluid the aquifer asked to update, the surface pass and structure pieces mark fluid they place, and springs and geodes ask for a tick. A generated chunk now carries those positions for its world to schedule.
