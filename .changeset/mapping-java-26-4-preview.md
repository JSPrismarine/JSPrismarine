---
'@jsprismarine/mapping': patch
---

The package ships tables for the Java preview, `26.4-snapshot-10`, mapped onto Bedrock preview protocol 2259. Every block, item, entity type, biome, mob effect and potion 26.4 adds has a 2259 counterpart, so the preview adds no losses. `BedrockBiomeLoss` takes an optional `javaSince`, the first pinned Java release with a biome for it: `minecraft:ice_caves` is a loss in the 26.3 tables and mapped in the preview's. The package's exports still read the default release's tables.
