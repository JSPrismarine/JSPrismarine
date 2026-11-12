---
"@jsprismarine/prismarine": patch
---

Each level's worlds now have their own entity runtime, store and change log, so two `worlds.<name>` entries no longer share one Overworld's state.

The runtime and the content world adapter were keyed by dimension alone, so both Overworlds shared one. A block placed in one level was sent to the other level's players. A mob summoned in one level was shown in the other. A player moved with `/debug changeWorld` entered the default level's store. An undo in one level was written into the other's chunk, or stopped both worlds. They are now keyed by level and dimension, and the server's block and item actions name the level of the world they act in: a block placed, a container opened or an item used in a second level reads and writes that level, not the default level's world of the same dimension. The default level keeps its dimension-only key, so the content packages, which address a world by its dimension, still reach it.

`Server.getEntityRuntime`, `WorldManager.getWorldByDimension` and the content world handle's `at` and `actorsAt` take an optional level name. The handle's new `entitiesAt` answers a world's entity runtime without building it.
