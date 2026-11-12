import { vi } from 'vitest';

/** More steps than any wait in these tests needs; work that never settles fails instead of hanging. */
const MAX_STEPS = 2000;

/**
 * Advances the fake clock until `work` settles, then gives its outcome.
 *
 * Not `runAllTimersAsync`: test files share a worker, so a timer loop another file left running
 * (a RakNet client socket's tick, in the CI failures this replaced) reschedules itself on the fake
 * clock for as long as it is installed, and running every timer then never ends.
 * @param work - The work the test waits for.
 * @returns What `work` resolves to. A rejection is passed on.
 */
export const settleOnFakeClock = async <T,>(work: Promise<T>): Promise<T> => {
    let settled = false;
    const done = () => void (settled = true);
    work.then(done, done);
    for (let step = 0; !settled && step < MAX_STEPS; step++) await vi.advanceTimersByTimeAsync(50);
    return work;
};
