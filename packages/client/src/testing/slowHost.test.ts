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
});
