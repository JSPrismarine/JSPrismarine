/**
 * Runs a callback once after a delay. Returns a function that cancels the callback if it has not
 * run yet, so the caller holds no timer handle type and a test can pass its own clock.
 */
export type CancelableTimer = (callback: () => void, delayMs: number) => () => void;

/** A {@link CancelableTimer} on an unreferenced `setTimeout`, so a pending callback never holds the process open. */
export const unrefTimer: CancelableTimer = (callback, delayMs) => {
    const timer = setTimeout(callback, delayMs);
    timer.unref();
    return () => clearTimeout(timer);
};
