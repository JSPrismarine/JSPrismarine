---
"@jsprismarine/prismarine": patch
---

Give each level's worlds their own entity runtime, store and change log. The runtime and the content world adapter were keyed by dimension alone, so with two `worlds.<name>` entries both Overworlds shared one: a block placed in one level was sent to the other level's players, a mob summoned in one level was shown in the other, a player moved with `/debug changeWorld` entered the default level's store, and an undo in one level was written into the other's chunk or stopped both worlds. They are now keyed by level and dimension. The default level keeps its dimension-only key, so the content packages, which address a world by its dimension, still reach it. `Server.getEntityRuntime`, `WorldManager.getWorldByDimension` and the content world handle's `at` and `actorsAt` take an optional level name, and the handle's new `entitiesAt` answers a world's entity runtime without building it.
