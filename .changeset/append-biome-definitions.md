---
'@jsprismarine/protocol': patch
'@jsprismarine/errors': patch
---

Add `appendBiomeDefinitions` to `@jsprismarine/protocol/bedrock/packet/BiomeDefinitionListPacket`. It adds biome entries to a captured `BiomeDefinitionList` payload, interning their names and tags in the string list, and writes the same bytes BDS 1.26.60.6 sends for a behavior pack's biomes. A payload entry with chunk generation data throws `ProtocolCodecErrors.BiomeChunkGenerationDataUnsupported`.
