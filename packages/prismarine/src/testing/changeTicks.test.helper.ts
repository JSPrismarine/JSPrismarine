/**
 * Opening a tick of a change log after a test set its world up between ticks.
 *
 * A store holds the state entries made between ticks for the next tick to open with, so the
 * spawns and writes of a test's setup would land in the tick it means to measure. These seal them
 * as a tick of their own first.
 */

/** A log with ticks to open and seal: an `EntityStore`. */
interface StoreTicks {
    beginTick(): void;
    sealTick(): unknown;
}

/** A world's change log ticks, as the ticker opens and seals them. */
interface WorldTicks {
    beginChangeTick(): void;
    sealChangeTick(): unknown;
}

/** Seals what setup made between ticks, then opens the tick a test measures. */
export const beginMeasuredTick = (store: StoreTicks): void => {
    store.beginTick();
    store.sealTick();
    store.beginTick();
};

/** {@link beginMeasuredTick} for a world, through the ticker's calls. */
export const beginMeasuredChangeTick = (world: WorldTicks): void => {
    world.beginChangeTick();
    world.sealChangeTick();
    world.beginChangeTick();
};

/** The phases a world runs after its tick seals that send entities and what happened to them. */
interface ReplicationPhases {
    flushEntities(): void;
    flushOccurrences(): void;
    flushDepartures(): void;
    flushOwnerViews(): void;
}

/**
 * Sends what the sealed ticks a replicator read changed in its entities, in the order
 * `World.replicateTick` runs the phases: the entities that entered and were written, the
 * occurrences, the entities that left, and the owners' views. Each phase queues its packets as
 * it is called; this settles after a turn of the event loop, so a transport that frames later
 * has framed them.
 */
export const replicateEntities = async (replicator: ReplicationPhases): Promise<void> => {
    replicator.flushEntities();
    replicator.flushOccurrences();
    replicator.flushDepartures();
    replicator.flushOwnerViews();
    await new Promise<void>((resolve) => setImmediate(resolve));
};
