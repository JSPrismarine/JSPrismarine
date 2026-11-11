---
"@jsprismarine/prismarine": minor
"@jsprismarine/entities": patch
---

Dropped stacks and saved actors with no pack type are store actors, so the player body is the one subclass of `Entity` left. A dropped stack is shown through an `ItemActor` (`entity/data/itemActor.ts`), a `StoreActor` that goes on the wire as an `AddItemActor`, ticks its portal clock through `StoreActor.update` and moves between dimensions from one store to the other. A saved actor whose type no loaded pack declares, which used to stay in the world as a `GenericEntity`, comes back through `LiveEntityRuntime.restoreInert` as an `InertActor` over the new built-in `jsprismarine:inert_actor` type: it is shown and saved under its own identifier with every actor record tag it was loaded with, and runs nothing. Dropped stacks merge, are picked up, burn, fall into the void and go through portals as before, and saves are unchanged.

Breaking: a dropped stack is no longer in `World.getEntities()` or found by `World.getEntity()`; `World.getActors()` and `World.getActor()` list and find it. `ItemActorBody`, `ItemBodies`, `LiveEntityRuntime.itemBodies`, `unload` and `removeBody` are removed, and `LiveEntityRuntime.adoptItem` takes the leaving actor, where it arrives and its cooldown. `EntitySerializer.fromNBT` returns a plain `StoredActor` and takes no world, and `LiveEntityRuntime.restore`, `restoreItem` and `restoreExisting` take one. `World.addEntity` no longer hands a body to the store. `entity/GenericEntity.ts` and `Entities.writtenEntities` are removed.

The entity overlay adds `jsprismarine:inert_actor`, the type a saved actor no pack declares is held under.
