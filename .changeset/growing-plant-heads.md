---
'@jsprismarine/block-behaviors': patch
---

Grow cave vines and kelp from their heads, as Java's `GrowingPlantHeadBlock` does. A random tick used to advance the age of every segment in place, so a cave and its vines wrote block states thousands of times a minute without growing anything. Now only a head younger than 25 grows, one block down into air for cave vines (berries at 0.11) and up into water for kelp, at Java's 0.1 and 0.14.
