---
'@jsprismarine/prismarine': patch
---

A world with a saved mob starts again. Restoring a mob with its chunk built its goals before the world had finished enabling, and reading the level clock there threw, so the server stopped on startup. The clock is now read on the first sight check. The lookup of a world by dimension, which every block read through the content adapter makes, also no longer walks the level's worlds each time.
