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
