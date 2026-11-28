---
'@jsprismarine/prismarine': patch
---

A script reads a pack block's water rule and collision from its definition. `Block.setWaterlogged(true)` on a block whose `minecraft:liquid_detection` lets it contain water used to throw `Block type cannot be waterlogged.`, because every pack block answered as solid and dry, so Bedrock Dynamic Lights could not light anything underwater.
