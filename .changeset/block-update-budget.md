---
'@jsprismarine/prismarine': patch
---

Cap the time a tick spends on block updates, not only their count, so a slow host no longer stalls a tick for seconds when a fill or a chunk load queues thousands of them.
