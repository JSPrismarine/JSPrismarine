---
'@jsprismarine/prismarine': patch
'@jsprismarine/engine-systems': patch
---

Leave nothing on the ground while a freshly generated chunk settles. The fluid generation leaves to tick, and what it sets off, used to wash plants away and drop them, so exploring new terrain left hundreds of items lying in caves. While a generated chunk settles, what the world's own block updates, scheduled ticks and random ticks destroy in it drops nothing. It settles until it and its eight neighbors are loaded with no fluid tick left, or until a player, a command or an entity writes a block in it, after which drops are as usual. `TickList` gains `hasTicksInChunk`.
