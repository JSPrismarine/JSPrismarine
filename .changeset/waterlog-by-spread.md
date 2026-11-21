---
'@jsprismarine/block-behaviors': patch
'@jsprismarine/prismarine': patch
---

Waterlog a block that a water source spreads into, as Java's `SimpleWaterloggedBlock.placeLiquid` does, under the default `fluid-replacement: java` rule, and send a waterlogged block's water to clients on the liquid layer. `WorldActions` gains optional `setLiquid` and `holdsWater` hooks.
