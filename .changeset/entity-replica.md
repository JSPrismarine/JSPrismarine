---
"@jsprismarine/prismarine": minor
"@jsprismarine/entity-goals": patch
---

Keep a replica of each world's entities from the change log. `NetworkWorldReplicator` reads every sealed tick into an `EntityReplica` (`network/replica/EntityReplica.ts`), which takes each entity from the saved form its membership entry carries and writes every entity and slot entry after it over that form. `entityView` answers what a client is shown of an entity from that data alone, as the new `EntityView` that `entityViewOf` (`entity/data/actorView.ts`) builds from live state, and `entityReplicaCounts` reports what it holds. Entities are still sent as before.

Every field a client is shown is now logged. The status effect clock, the actor record tags and the online owner are logged body fields (`statusEffectClock`, `actorTags`, `owner`), the `in_water` and `on_ground` conditions are logged as they change, and a trader's offers are logged as its `merchant` field after each draw, trade and restock. `StoreActor.persistentNbt` is kept as bytes in the store and answers a new compound on every read, so a caller that changed the compound in place assigns it back. A trade screen trades through `EntityRuntime.tradeSource`. A unit of work that throws now also undoes the offers, conditions and owner it changed, and a zero that changes sign is logged as a change.

The metadata projection runs from plain values: `projectActorMetadata` takes the facts a component set decides (`componentMetadataFacts`, over a live instance or a set resolved from a type and its groups) and an `ActorMetadataState`. `ActorMetadataInputs` holds `spawnBlock` in place of `fallingBlock`. In `@jsprismarine/entity-goals`, `navigationProfile` accepts any `NavigationSource`, the four members of an `EntityInstance` it reads.
