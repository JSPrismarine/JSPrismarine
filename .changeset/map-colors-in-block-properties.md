---
'@jsprismarine/mapping': minor
'@jsprismarine/blocks': minor
---

`bedrockBlockPropertiesOf` answers `mapColor`, the block state's Java `MapColor` by its constant's name in lower case, such as `grass`, `water` or `none`, and `waterloggedMapColor` for the barrier and the light blocks, whose waterlogged states Java gives `water`. Both are the block's own color, before a map draws a waterlogged block without a sturdy top as its water. `BedrockBlockProperties` requires `mapColor`, so code that builds one needs it: a `BlockPropertySource` passed to `generateVanillaOverlay` in `@jsprismarine/blocks` has to return it from `propertiesOf`. `BEDROCK_ONLY_FALLBACK` gives `none`.
