---
'@jsprismarine/prismarine': patch
---

A sub chunk read from a world at version 1, which holds one layer, is written back at version 9 once it holds a second, such as water put into a fence. Saving it used to throw, so the chunk's later changes never reached disk.
