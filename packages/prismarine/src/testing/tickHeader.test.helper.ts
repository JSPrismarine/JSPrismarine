import type { TickHeader } from '../world/changelog/TickHeader';

/**
 * A tick header for a world double built on the prototype without a level or world systems,
 * which `World.tickHeader` reads. Doubles return it from `tickHeader`, so their sealed ticks
 * carry a header as a real world's do.
 */
export const QUIET_TICK_HEADER: TickHeader = {
    tick: 0,
    weather: { clearWeatherTime: 0, rainTime: 0, thunderTime: 0, raining: false, thundering: false },
    gameRules: [],
    pendingChunkLoads: [],
    randomTickState: 0,
    pendingLighting: { queued: 0, deferred: 0 }
};
