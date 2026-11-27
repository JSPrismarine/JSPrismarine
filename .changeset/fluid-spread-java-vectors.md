---
'@jsprismarine/block-behaviors': patch
---

Spread water and lava as Java's `FlowingFluid.getSpread` does in the cases found by comparing the port with answers Java computed from the pinned server jar ([#3763](https://github.com/JSPrismarine/JSPrismarine/issues/3763)). Water now takes the place of flowing lava of amount 4, and of shallow lava with lava above it. The slope search no longer flows through a block that holds water, or falls into one, such as a top slab or seagrass. A source between two sources now forms over any block the host calls solid, through the new optional `WorldActions.isSolid`. A host without it keeps the full cube test.
