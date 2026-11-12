---
"@jsprismarine/prismarine": patch
---

A dropped item leaves the world with its chunk. An unload saved the stack with the chunk and left it in the entity store, so coming back to the chunk loaded a second copy beside it. A stack entering or leaving a chunk now also marks that chunk's entities changed, so the save before an unload writes it.
