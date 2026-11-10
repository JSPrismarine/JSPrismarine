# One entity model, with players and items in the same store

Status: accepted

Every entity in a world lives in one entity store, and every entity has the shape a data-driven mob has today: a reference to a resolved entity type, the component state of an `EntityInstance`, and a body. The legacy class tree (`Entity`, `GenericEntity`, `Human`, `Player`, `Item` and `EyeOfEnderSignal`) and the mirror that copies each data-driven mob into a legacy body are removed. The store lives in Prismarine's host layer, because `@jsprismarine/entities` is documented as knowing nothing about a server. Items and the eye of ender, which Mojang ships no entity file for, get built-in definitions.

A player is an entity with player components for vitals, inventory, game mode and abilities. Its network session is a separate object that the entity references, and the session does not reference the entity in return. Chat fan-out, permissions and persistence become services keyed by player identity, and respawn search becomes a world service.

Every data-driven mob exists twice today, as an `EntityRuntime` entity and as a `GenericEntity` body in the world's legacy map, and health crosses between the two by comparing the body's value with the last one the mirror wrote. Two models mean two sets of rules for damage, tracking and replication. The project's first goal is to behave like Minecraft while following Mojang through data, and the data-driven model is the one that follows Mojang. Performance is a close second, and one model removes both the copy and the per-tick comparison. The cleanup lands as one program, so no slice ends with players on one model and mobs on the other.

## Considered options

A full ECS. The server re-architecture plan rejected it as the whole architecture because session and NBT data is heterogeneous, and it keeps structure-of-arrays storage as a later option inside the runtime. Parallel regions inside one world would need that storage. This program does not parallelize a world. It keeps the seams that make that possible later.

## Consequences

The `Entity`, `Player`, `World` and `Item` classes stop being promised to plugin authors. The Bedrock Script API is the primary extension model, so the legacy plugin events are not a compatibility constraint on this change. Below 1.0.0, the versioning policy treats the removal as a `minor` bump.
