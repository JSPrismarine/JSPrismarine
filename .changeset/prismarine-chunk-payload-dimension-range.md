---
'@jsprismarine/prismarine': patch
---

Shape a chunk's network payload for the dimension it belongs to. The padding below a shallow dimension and the number of biome sections now follow the range the client gives the chunk's dimension id, so a Nether chunk goes out with no padding and 8 biome sections and an End chunk with 16, where both used to get the Overworld's four padding sub chunks and 24 sections.
