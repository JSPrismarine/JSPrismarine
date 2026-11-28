---
'@jsprismarine/prismarine': patch
---

Send the biomes behavior packs define, and fill a pack dimension with its default biome. The join adds every biome a pack defines outside the `minecraft` namespace to `BiomeDefinitionList`, numbered from 30000, as BDS does. A pack dimension's `minecraft:default_biome`, `minecraft:ocean` when the document leaves it out, is the biome its `DimensionData` names and its void chunks are filled with, and a document without `minecraft:clouds` no longer turns clouds on.
