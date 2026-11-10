# One entity model, with players and items in the same store

Status: accepted

Every entity in a world lives in one entity store, and every entity has the shape a data-driven mob has today: a reference to a resolved entity type, the component state of an `EntityInstance`, and a body. The legacy class tree (`Entity`, `GenericEntity`, `Human`, `Player`, `Item` and `EyeOfEnderSignal`) and the mirror that copies each data-driven mob into a legacy body are removed. The store lives in Prismarine's host layer, because `@jsprismarine/entities` is documented as knowing nothing about a server. Items and the eye of ender, which Mojang ships no entity file for, get built-in definitions. The player's shipped definition leaves out what Bedrock keeps in code, such as `minecraft:health`, so the player gets a built-in overlay that adds only those parts and leaves the shipped components to the pack.

A player is an entity with player components for vitals, inventory, game mode and abilities. Its network session is a separate object outside the world. The session holds its entity's id, and the entity holds no reference to the session. Packets reach the entity as inputs addressed to that id, and the entity's changes reach the session through replication, which finds a player's session by entity id. Chat fan-out, permissions and persistence become services keyed by player identity. Respawn search becomes a level service, and a respawn into another dimension is a transfer between worlds.

Three things that are true of every mob are not true of a player, and the store states each as a rule. The client owns a player's movement, so the tick applies no gravity, navigation or pushes to that body, and an impulse aimed at it is an occurrence that replication sends to its client. A player that dies stays in the store and is revived by respawn, so its session's id keeps resolving. A player's health comes from the overlay above.

The direction of the session link was first recorded the other way round. [The player spike](../research/player-entity-spike.md) counted the calls. The simulation reaches a session on 104 lines, and replication or a transfer message can serve every one of them, while every inbound packet has to reach the entity.

Every data-driven mob exists twice today, as an `EntityRuntime` entity and as a `GenericEntity` body in the world's legacy map, and health crosses between the two by comparing the body's value with the last one the mirror wrote. Two models mean two sets of rules for damage, tracking and replication. The project's first goal is to behave like Minecraft while following Mojang through data, and the data-driven model is the one that follows Mojang. Performance is a close second, and one model removes both the copy and the per-tick comparison. The cleanup lands as one program, so no slice ends with players on one model and mobs on the other.

## Considered options

A full ECS. The server re-architecture plan rejected it as the whole architecture because session and NBT data is heterogeneous, and it keeps structure-of-arrays storage as a later option inside the runtime. Parallel regions inside one world would need that storage. This program does not parallelize a world. It keeps the seams that make that possible later.

## Consequences

The `Entity`, `Player`, `World` and `Item` classes stop being promised to plugin authors. The Bedrock Script API is the primary extension model, so the legacy plugin events are not a compatibility constraint on this change. Below 1.0.0, the versioning policy treats the removal as a `minor` bump.
