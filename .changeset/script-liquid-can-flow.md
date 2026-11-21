---
'@jsprismarine/bedrock-data': patch
'@jsprismarine/script-host': patch
'@jsprismarine/prismarine': patch
---

`Block.liquidCanFlowFromDirection` answers as on a Bedrock Dedicated Server instead of throwing. `@jsprismarine/bedrock-data` captures a new `block-liquid-flow` table, the sides each permutation of a slab, stairs, shelf, sculk sensor or heavy core stops water from, and exports it as `scriptBlockLiquidFlow`; every other block lets water in from every side.
