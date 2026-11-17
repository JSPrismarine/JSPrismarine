---
'@jsprismarine/blocks': patch
---

Generate each block's liquid reaction from the pinned Bedrock Dedicated Server's Script API instead of reading it from the checked-in geometry table. `bedrockLiquidReactionOf` and `isWashedAway` now read `src/tables/blockLiquidReactions.json`, which `pnpm --filter @jsprismarine/blocks run generate:liquid-reactions` writes from the `dump:bedrock` capture, so a block added by a newer capture gets its reaction. The answers are the same for every block type of 1.26.51. `blockGeometry.json` no longer has a `liquid` field.
