/**
 * One entity of a world, as the world code outside the entity store reaches it.
 *
 * A legacy {@link Entity} is a player or the body of a dropped stack. Everything else is an
 * entity of the store, which the world code reaches through its {@link StoreActor}: the actor
 * answers from the store and hands every effect back to it. Slice 5 of the entity and tick
 * re-architecture moves players into the store, and this narrows to the actor.
 */
import type { StoreActor } from '../entity/data/storeActors';
import type { Entity } from '../entity/Entity';

/** A legacy entity, or a store entity through its actor. */
export type WorldActor = Entity | StoreActor;
