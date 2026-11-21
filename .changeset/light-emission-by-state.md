---
'@jsprismarine/blocks': patch
'@jsprismarine/mapping': patch
---

Light each block state at its Java level. The vanilla overlay gave a block one light level for all its states, so lit candles were dark, unlit campfires and copper bulbs shone, and respawn anchors, sea pickles and lava cauldrons gave no light. Each state whose Java light differs from its block's now gets a permutation with its own `minecraft:light_emission` and `minecraft:light_dampening`. `@jsprismarine/mapping` exports `bedrockBlockStateOverridesOf`, the per-state overrides of a block's properties.
