---
"@jsprismarine/prismarine": minor
"@jsprismarine/server": patch
---

Data-driven mobs no longer have legacy bodies. Every entity of the entity store is reached through its `StoreActor`, which answers from the store and holds no copy of it, and `World.getActor` and `World.getActors` list a world's entities with store entities as their actors. Commands and selectors, legacy explosions and swings, interactions and trades, saves and the replay digest, portal travel, spawner caps, the dragon fight and riding all go through the actors.

Breaking: `LiveEntityRuntime.bodies` is gone, and a store entity is no longer in `World.getEntities()` or found by `World.getEntity()`. `EntityDamageEvent.getEntity()`, `EntityDeathEvent.getEntity()`, `EntityPortalEnterEvent.getEntity()` and a `DamageSource`'s `attacker` and `projectile` are a `WorldActor`, a legacy `Entity` or a `StoreActor`. `LiveEntityRuntime.isInRide` takes a runtime id.

A summon through the command host's `entities.summon` with a `name` names the entity in the store, so clients see the name; it had been written onto the hidden legacy body.
