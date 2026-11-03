---
'@jsprismarine/prismarine': minor
---

Spawn mobs on the ground under leaves and plants instead of on top of them. The surface spawn pass tries one position per column, and the world adapter answered with one above the highest block that is not air: the canopy over a forest and the tall grass standing on a plain. Every passive spawn rule names the ground it belongs on, so those columns rejected every rule and most of an overworld spawned nothing. `ContentBlockAccess.surfaceY` now walks down to the first block that blocks motion and is not leaves, which is Java's `MOTION_BLOCKING_NO_LEAVES` heightmap and the one its `SpawnPlacements` reads. `WorldContentBiomes` is now `WorldContentFacts` and carries the block types, their flattened columns and the tag stack that the walk reads.
