---
"@jsprismarine/prismarine": minor
---

Breaking: `EntityIndex` no longer files legacy entities. `addLegacy`, `refileLegacy`, `removeLegacy` and `legacyWithin` are gone; every live entity is a store entity, which `storeWithin`, `within`, `withinBox` and `itemsWithin` find. An explosion from `explode` catches store entities only.

Breaking: `loose` (`entity/Archery`) takes the shooter as a `StoreActor`, and `LiveEntityRuntime.killEntity` takes its target as one. Pass the entity's actor, such as `player.getActor()`.

`World.actors()` walks a world's entities in place without copying or sorting them, and `createChunkSaveContext` accepts them in any order and lists each chunk's entities in ascending runtime id order. A provider's `EntitySource` may answer any iterable. `World.breakBlock` takes a `BlockBreaker`, which a `Player` satisfies.

`ParseTargetSelector` takes any `SelectorEntity` and answers in the type it was given, and `ParseTildeCaretNotation` reads only the source's position. `isCommandExecutor` takes a `CommandTarget`, an executor or anything with a name. `playerMiningOf` and `blockMiningOf` accept `null` and answer `null`.
