---
'@jsprismarine/spawning': minor
'@jsprismarine/prismarine': minor
---

Stop the underground spawn pass putting mobs inside rock. It drew a y uniformly between the world
floor and the surface and spawned there without asking what was at the position, so in a world
with few caves almost every hostile spawn landed inside a solid block. Measured on a flat world
with two players connected: 11 of 11 zombies, 3 of 3 spiders, 3 of 3 creepers and the one witch
were standing inside dirt or stone. None of them could path anywhere, none of them despawned, and
between them they held the monster pool at its cap so nothing else could spawn either.

`SpawnWorld` gains `solid(at)`, and a draw whose own block or the block over its head is solid is
refused, which is what Java's `NaturalSpawner.isSpawnPositionOk` does with one. The server answers
it from the flattened solidity column indexed by runtime id, so a pack's own block answers for
itself, and an unloaded position counts as solid.
