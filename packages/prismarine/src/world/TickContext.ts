import { AsyncLocalStorage } from 'node:async_hooks';

/** One running tick's simulation phases, closed once they have finished. */
interface TickScope {
    open: boolean;
}

/** Work that is waiting until a tick lets it continue, counted by whoever runs that work. */
export interface TickWaitTracker {
    /** The work now waits for a tick and nothing else. */
    park(): void;
    /** The tick let the work continue, or it stopped waiting. */
    unpark(): void;
}

const tickScopes = new AsyncLocalStorage<TickScope>();
const waitTrackers = new AsyncLocalStorage<TickWaitTracker>();

/**
 * Runs a tick's simulation phases, so code they call, and code those calls await, can tell
 * that it runs inside the tick.
 *
 * The scope closes when `work` settles. A promise the tick started and did not wait for keeps
 * the scope, and once the tick has finished it reads as outside every tick.
 *
 * @param work - The input step and the phases after it, up to the end of the simulation.
 * @returns What `work` returns.
 */
export const runInTick = async <T>(work: () => Promise<T>): Promise<T> => {
    const scope: TickScope = { open: true };
    try {
        return await tickScopes.run(scope, work);
    } finally {
        scope.open = false;
    }
};

/**
 * Whether the caller runs inside a tick's simulation phases ({@link runInTick}).
 *
 * The input step, world updates, the tick event and tick functions are inside. Chunk delivery,
 * packet handlers of the connection and read lanes, and anything else that runs between ticks
 * are outside.
 */
export const insideTick = (): boolean => tickScopes.getStore()?.open === true;

/**
 * The tick the caller runs inside, which reads as closed once that tick has finished, or
 * undefined outside every tick. Kept by work that has to know later whether the tick that asked
 * for it is still waiting.
 */
export const currentTickScope = (): { readonly open: boolean } | undefined => tickScopes.getStore();

/**
 * Runs work under a tracker, so a wait that only a tick can end, such as a chunk held for the
 * next input step, is reported to whoever runs that work.
 *
 * @param tracker - Told when the work parks on a tick and when it continues.
 * @param work - The work to run.
 * @returns What `work` returns.
 */
export const trackTickWaits = <T>(tracker: TickWaitTracker, work: () => T): T => waitTrackers.run(tracker, work);

/** The tracker the caller's work runs under ({@link trackTickWaits}), if any. */
export const currentTickWaitTracker = (): TickWaitTracker | undefined => waitTrackers.getStore();
