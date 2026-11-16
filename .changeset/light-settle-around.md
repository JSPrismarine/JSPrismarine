---
'@jsprismarine/lighting': patch
---

Add `LightEngine.settleAround(chunkX, chunkZ, budget)`, which finishes the light of one chunk by running only the nodes queued in it and its eight neighbors. Light reaches fifteen blocks, so the chunk then holds the levels a full flush gives it, and the work does not depend on how much is queued elsewhere. The light queue keeps its nodes per chunk column so that call reads no other column, and `flush` now empties the column that has waited longest before it starts the next. A full flush reaches the same light as before.
