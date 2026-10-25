---
'@jsprismarine/blocks': patch
---

Publish the per-state block geometry column no property table had. `bedrockCollisionTopOf` answers
how high a body standing in a block's cell is held up, and `bedrockLiquidReactionOf` what a liquid
reaching the block does to it, for all 1477 palette blocks over 22091 states.

The source is a Bedrock Dedicated Server's own block table, captured in the resources submodule and
flattened by `utils/generate-geometry.mjs` into a committed table keyed by block identifier, with
3014 per-state overrides keyed by runtime id. Java's shapes would have been the wrong ones: a cactus
is 0.9375 tall in Java and a full block in Bedrock, and the client decides where a player may stand.

This is the column the overlay generator says it does not have, and the one physics and pathfinding
outside the content runtime were filling with hand-written name lists.
