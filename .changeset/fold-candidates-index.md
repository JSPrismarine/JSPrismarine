---
'@jsprismarine/worldgen': patch
---

The surface pass folds a biome condition over a block's eight candidate cells with an index loop that stops at the first disagreement, instead of `for...of` over all eight.
