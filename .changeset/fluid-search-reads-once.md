---
'@jsprismarine/block-behaviors': patch
---

Read each cell of a fluid's slope search once, as Java's `FlowingFluid.getSpread` does. The search revisited the same cells and read the world again each time: a water source spreading on flat ground made 1979 block reads for 126 cells, and now makes 136.
