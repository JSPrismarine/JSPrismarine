---
'@jsprismarine/mapping': patch
'@jsprismarine/blocks': patch
---

Light each block state at its own Java level. `@jsprismarine/mapping` exports `bedrockBlockStateOverridesOf`, the per-state overrides of a block's Java properties, and the vanilla overlay writes each override that changes light as a permutation, so a lit candle, an unlit campfire, a charged respawn anchor or a lit copper bulb emits what it does in Java rather than its block's one level.
