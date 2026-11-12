import { untrackedTickWaits } from './TickWaits';

/**
 * Whether a tick's simulation phases are running, which the ticker sets around them.
 *
 * A plain flag: the phases run in one synchronous call and await nothing, so nothing that runs
 * outside them can run while it is set, and work they start and do not wait for runs after they
 * have cleared it.
 */
let ticking = false;

/**
 * Runs a tick's simulation phases, so code they call can tell that it runs inside the tick.
 *
 * @param work - The input step and the phases after it, up to the end of the simulation, in one
 *   synchronous call.
 * @returns What `work` returns.
 */
export const runInTick = <T>(work: () => T): T => {
    const outer = ticking;
    ticking = true;
    try {
        return work();
    } finally {
        ticking = outer;
    }
};

/**
 * Runs work as though no tick were running, so nothing it does before its first wait reads as
 * inside a tick, and nothing it starts reports a wait to a tracker. A chunk load a ticket starts
 * runs this way, so the chunk waits for an input step even while the tick that asked is still
 * open, and so does work a tick starts and must not wait for, such as building the world a trip
 * goes to. What the work does after its first wait runs once the tick has ended.
 *
 * @param work - The work to start.
 * @returns What `work` returns.
 */
export const outsideTick = <T>(work: () => T): T => {
    const outer = ticking;
    ticking = false;
    try {
        return untrackedTickWaits(work);
    } finally {
        ticking = outer;
    }
};

/**
 * Whether the caller runs inside a tick's simulation phases ({@link runInTick}).
 *
 * The input step, world updates, the tick event and tick functions are inside. Chunk delivery,
 * packet handlers of the connection and read lanes, and anything else that runs between ticks
 * are outside.
 */
export const insideTick = (): boolean => ticking;
