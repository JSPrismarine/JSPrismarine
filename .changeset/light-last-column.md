---
'@jsprismarine/lighting': patch
---

Remember the chunk column a light flood last looked up. Each flood node looked up its own column and its six neighbors' by a key wide enough to be a heap number, so a flood of 2292 nodes made 25879 lookups. It now makes fewer than one per node.
