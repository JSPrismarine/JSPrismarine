---
'@jsprismarine/worldgen': patch
---

Break exact climate ties by search tree order instead of by the previous lookup. A biome at a fixed seed and position no longer changes with the lookups that ran before it. The answer is the one Java gives a thread with no earlier lookup.
