---
'@jsprismarine/spawning': patch
---

Stop slimes from taking the whole monster pool. `spawn_rules/slime.json` carries no brightness
filter, no height filter and a weight of 100, so on its own it made the slime the only monster that
passes a daylit surface position. On a live server that filled the 70-entity monster cap with
slimes and left nothing for the zombie, the skeleton, the creeper or the spider.

The rule Bedrock actually applies is not in the file. The engine holds a two-branch condition in
code, and `Spawn Rules.json`'s 24 components cannot express either branch: one is a hash of the
chunk coordinates, the other a draw against the moon phase. `Spawner` now asks an `EngineSpawnRule`
for the entity, if there is one, before it evaluates the file's conditions, and
`SpawnerOptions.engineRules` lets a host replace the set or pass an empty map to run the file alone.

`slimeSpawnRule` is Bedrock's, read out of the function at virtual address `0xbb80040` of BDS
1.26.51.1's `bedrock_server` rather than out of Java's `Slime.checkSlimeSpawnRules`, because the two
editions disagree about the parts a player builds farms on. At Y 38 and below the position has to be
in a slime chunk and nothing else is asked. Above that it has to be in a biome tagged
`spawns_slimes_on_surface`, between Y 50 and Y 68, with a light level at or under a draw over
`[0, 8)`, and a float draw under the moon's brightness for the day. Everything else spawns no slimes.

`isSlimeChunk` is the Bedrock hash: a Mersenne twister seeded with `chunkX * 0x1f1f1f1f ^ chunkZ`,
first draw modulo ten. The world seed is not an input, which is why a Bedrock slime farm sits at the
same chunk coordinates in every world, and why Java's seeded `WorldgenRandom.seedSlimeChunk` is the
wrong formula here. A test pins the hash against a twister written from the reference
implementation, so a drift in either the seed or the generator fails the build.
