---
"@jsprismarine/prismarine": minor
---

Fix six problems in the level lifecycle around dimensions:

- A player whose record names a lazy dimension comes back there: `lastPlayerRecord` takes the player's `Level` in place of the world list, a breaking change for a caller that passed the list, and builds the dimension's world when its stem is lazy, and warns when the level has no stem for the record's dimension instead of silently keeping the player in the default world at the other dimension's coordinates.
- `resolveStems` and `Level` refuse two stems that bind one dimension type, naming both, since both worlds would take one Bedrock id and write over each other's chunks.
- `Level.update` ticks its worlds one after another in stem order, and a world claims each entity's update per tick through `Entity.claimUpdate`, so an entity a portal moves mid-tick is updated once.
- A lazy dimension built on its first visit no longer searches for a spawn or generates the preload radius inside the server tick; `WorldData.startRegion` says whether enabling prepares the start region, and the level defers it for a lazy stem.
- `Level.world` drops a world whose enabling failed instead of caching the rejection, and `Level.worlds()` lists only worlds whose enabling has finished, which is what `WorldManager.getWorldByDimension` promises. `Level.loadedWorld` still answers a world mid-enable.
- The clock is read back from `level.dat`'s `Time` through the new `Provider.readLevelData`, so a restart continues the day instead of starting at tick zero.
