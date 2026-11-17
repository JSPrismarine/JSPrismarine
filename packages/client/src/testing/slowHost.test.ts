import { afterEach, describe, expect, it } from 'vitest';

import { nextTurn, SlowHost } from './slowHost.test.helper';

const turns = async (count: number): Promise<void> => {
    for (let index = 0; index < count; index++) await nextTurn();
};

/** Whether a held completion was started by this file, since other files share the worker's host. */
const fromHere = (origin: string): boolean => origin.includes('slowHost.test.ts');

describe('SlowHost', () => {
    afterEach(() => {
        SlowHost.stop();
    });

    it('counts a held completion once it is delivered, and not one that was cleared', async () => {
        SlowHost.start();
        let ran = 0;

        // Synchronous, so no other file's work can land in between.
        const before = SlowHost.heldCount;
        clearImmediate(setImmediate(() => ran++));
        setImmediate(() => ran++);
        expect(SlowHost.heldCount).toBe(before);

        await turns(32);
        expect(ran).toBe(1);
        expect(SlowHost.heldCount).toBeGreaterThanOrEqual(before + 1);
        expect(SlowHost.held().filter(({ origin }) => fromHere(origin))).toEqual([]);
    });

    // A RakNet ClientSocket ticks like this: an unref'd timer that schedules a `setImmediate`. A
    // socket another test file left open keeps ticking in the shared worker, so the held
    // immediate must not count as work a stepped harness waits for (#2984).
    it("does not count work an unref'd timer started, but still holds it", async () => {
        SlowHost.start();
        let fired = false;
        let ran = 0;
        setTimeout(() => {
            fired = true;
            setImmediate(() => ran++);
        }, 0).unref();

        while (!fired) await nextTurn();
        expect(ran).toBe(0);
        expect(SlowHost.held().filter(({ origin }) => fromHere(origin))).toEqual([]);

        await turns(32);
        expect(ran).toBe(1);
    });

    it('counts work a timer that keeps the process alive started', async () => {
        SlowHost.start();
        let fired = false;
        let ran = 0;
        setTimeout(() => {
            fired = true;
            setImmediate(() => ran++);
        }, 0);

        while (!fired) await nextTurn();
        expect(SlowHost.held().filter(({ origin }) => fromHere(origin))).toHaveLength(1);

        await turns(32);
        expect(ran).toBe(1);
        expect(SlowHost.held().filter(({ origin }) => fromHere(origin))).toEqual([]);
    });
});
