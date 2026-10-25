---
'@jsprismarine/prismarine': minor
---

Answer block physics and pathfinding from the published tables instead of hand-written name sets.
`BlockShapes` reads `@jsprismarine/blocks`'s per-state collision column, so all 22079 palette states
have a real height where eighty names used to and everything else was a full cube: a candle is no
longer a wall, a cauldron has a floor to stand in, and `double_cut_copper_slab` stopped being half a
block because its name ends in `_slab`. `BlockRules` reads the same table's liquid reaction, which
grows the blocks that need support from 30 names to 151 and the blocks a liquid washes away from 18
to 197, and takes gravity from `@jsprismarine/block-behaviors`, which adds the dragon egg and the
brushable blocks. `Environment` takes the climbing blocks from the block families, which is eleven
rather than the three that were listed, and catches a cobweb at last - the set named
`minecraft:cobweb`, which is not a palette identifier, so every fall into a web used to hurt.

Breaking: `Environment.BREAKS_A_FALL` and `Environment.WATER_BLOCKS` are now the functions
`breaksAFall` and `isUnderwater`, `BlockShapes.FENCE_HEIGHT` is gone in favor of `BlockView`'s
`JUMP_REACH`, and `BlockRules` no longer exports `NEEDS_SUPPORT`, `NEEDS_SUPPORT_SUFFIXES`, `FALLS`
or `WASHED_AWAY`. The predicates over them - `needsSupport`, `falls`, `isWashedAway` - are unchanged.
