---
'@jsprismarine/worldgen': patch
---

Speed up the 64-bit multiply behind biome jitter and positional seeds by replacing its floating point remainder with integer arithmetic. Its output is unchanged.
