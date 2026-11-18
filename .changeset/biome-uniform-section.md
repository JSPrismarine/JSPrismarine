---
'@jsprismarine/prismarine': patch
---

Read and write a `Data3D` biome section of one biome as the game does: the header and the biome id, with no palette size between them. Worlds from Bedrock Dedicated Server load their biomes, and the game reads the biomes of a world this server saved. Sections written in the old layout still load.
