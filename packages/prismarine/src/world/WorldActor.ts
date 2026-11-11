/**
 * One entity of a world, as the world code outside the entity store reaches it.
 *
 * Every live entity is a store entity, players and dropped stacks among them, which the world
 * code reaches through its {@link StoreActor}: the actor answers from the store and hands every
 * effect back to it. A legacy {@link Entity} is left only in test doubles and in the code that
 * still accepts one, which H-D of the entity and tick re-architecture deletes with the class,
 * and then this narrows to the actor.
 */
import type { StoreActor } from '../entity/data/storeActors';
import type { Entity } from '../entity/Entity';

/** A legacy entity, or a store entity through its actor. */
export type WorldActor = Entity | StoreActor;

/** Orders two entities by runtime id, ascending, which is the order every entity query answers in. */
export const byRuntimeId = (left: { getRuntimeId(): bigint }, right: { getRuntimeId(): bigint }): number => {
    const leftId = left.getRuntimeId();
    const rightId = right.getRuntimeId();
    return leftId < rightId ? -1 : leftId > rightId ? 1 : 0;
};
