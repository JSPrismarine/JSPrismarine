---
'@jsprismarine/worldgen': patch
---

Add the three stages that sit on top of the terrain core: the surface pass, the biome sources and
the carvers.

`SurfaceSystem` walks a chunk column by column, keeps the stone depth counters above and below
each solid block, derives the randomized surface depth from a positional random, and applies a
material rule tree. All five `material_rule` types and all eleven `material_condition` types 26.3
registers are implemented, including the four no other TypeScript implementation has: `bandlands`,
`hole`, `steep` and `ore_vein`. The ore vein rule reuses `compileOreVeinRule`, which 1.21 drove
from three noise router slots and 26.3 moved into the rule tree. Eroded badlands pillars and
frozen ocean icebergs run here too, as they do in Java.

`MultiNoiseBiomeSource` carries the seven-axis climate parameter model and Java's search tree over
it, with `ClimateParameterList.findBruteForce` as the independent check. `FixedBiomeSource`,
`CheckerboardBiomeSource` and `TheEndBiomeSource` cover the other three layouts. `BiomeManager` is
the per-block getter the surface pass needs: it picks between the eight surrounding biome cells
with Java's seeded jitter, so a biome-conditioned rule resolves per column rather than per chunk.

`carveChunk` runs the `cave` and `canyon` carvers over the 289 source chunks that can reach one
chunk, seeded per source chunk from the world seed, and records the result in a `CarvingMask`.

Every expected value comes from Mojang's own classes through
`utils/oracle/DumpSurfaceVectors.java`. Whole columns of the overworld, the nether and the end
match Java block for block after the surface pass; one synthetic rule per condition type matches
over the same chunk; the biome lookup matches over the full 7594-point overworld parameter list and
the 5-point nether one; and both carvers open exactly the blocks Java opens in five chunks. Carver
paths cannot match Bedrock Edition for the same seed, because Bedrock's generator is undocumented,
so the Bedrock-facing tests check determinism and distribution instead and say so in their names.
