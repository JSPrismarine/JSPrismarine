---
'@jsprismarine/prismarine': patch
---

Keep a chunk loaded when an entity walks into it between its unload save and the input step that takes it out, so a later unload pass saves the entity with the chunk instead of dropping it.
