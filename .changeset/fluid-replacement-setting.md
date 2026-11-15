---
'@jsprismarine/prismarine': patch
'@jsprismarine/block-behaviors': patch
---

Add the `fluid-replacement` setting, which picks the edition that decides what flowing water and lava destroy. `java`, the default, follows Java 26.3's `FlowingFluid.canHoldFluid`: a fluid washes away what `#minecraft:washed_away_by_fluids` lists and keeps out of every waterloggable block, so a big dripleaf or sugar cane stays standing. `bedrock` keeps the previous behavior, each block's Bedrock `liquidReactionOnTouch`. `@jsprismarine/block-behaviors` gains `WorldActions.liquidReactionOf`, through which a host answers by its rule.
