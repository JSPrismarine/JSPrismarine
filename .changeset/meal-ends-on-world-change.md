---
"@jsprismarine/prismarine": patch
---

A meal a player has not finished ends when the player leaves a world. It counted on the tick of the world it began in, so after a dimension change the next world's clock could finish it early or hold it for thousands of ticks.
