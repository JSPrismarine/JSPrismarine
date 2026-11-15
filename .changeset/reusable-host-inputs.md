---
'@jsprismarine/chunkgen': patch
'@jsprismarine/prismarine': patch
---

Send each terrain tile to the generation host once. A feature task carried the nine terrain tiles around its chunk, about 1.8 MB, and its neighbors carried six of the same nine, all serialized on the server thread. `@jsprismarine/chunkgen/reusableInput` marks a part of a task's input the host keeps under a key; a later task names the key, and a host that no longer holds it is sent the value again. Feature tasks now post about 270 KB each.
