import { AsyncLocalStorage } from 'node:async_hooks';

/**
 * Work that waits until an input step lets it continue, such as a read-lane handler or a chunk
 * delivery waiting for a chunk the next step admits. A harness that steps the server counts it,
 * so it knows the work is not stuck but waiting for the tick it is about to run.
 *
 * The work runs between ticks and awaits, so the tracker follows it across its awaits through
 * `AsyncLocalStorage`. The tick itself never awaits, and needs none of this; see `TickContext.ts`.
 */
export interface TickWaitTracker {
    /** The work now waits for a tick and nothing else. */
    park(): void;
    /** The tick let the work continue, or it stopped waiting. */
    unpark(): void;
}

const waitTrackers = new AsyncLocalStorage<TickWaitTracker>();

/**
 * Runs work under a tracker, so a wait that only a tick can end, such as a chunk held for the
 * next input step, is reported to whoever runs that work.
 *
 * @param tracker - Told when the work parks on a tick and when it continues.
 * @param work - The work to run.
 * @returns What `work` returns.
 */
export const trackTickWaits = <T>(tracker: TickWaitTracker, work: () => T): T => waitTrackers.run(tracker, work);

/**
 * Runs work under no tracker, so nothing it starts, and nothing those starts await, reports a
 * wait to the tracker of the caller.
 *
 * @param work - The work to start.
 * @returns What `work` returns.
 */
export const untrackedTickWaits = <T>(work: () => T): T => waitTrackers.exit(work);

/** The tracker the caller's work runs under ({@link trackTickWaits}), if any. */
export const currentTickWaitTracker = (): TickWaitTracker | undefined => waitTrackers.getStore();
