---
'@jsprismarine/prismarine': patch
---

`Block.setWaterlogged` from a script now writes the block's liquid layer, as on a Bedrock Dedicated Server: `true` puts a still water source there and `false` takes it out, so `isWaterlogged` reads the change back and players see the water.
