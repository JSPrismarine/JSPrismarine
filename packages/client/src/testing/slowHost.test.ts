import { afterEach, describe, expect, it } from 'vitest';

import { nextTurn, SlowHost } from './slowHost.test.helper';

const turns = async (count: number): Promise<void> => {
    for (let index = 0; index < count; index++) await nextTurn();
};

describe('SlowHost', () => {
    afterEach(() => {
        SlowHost.stop();
    });

    it('counts a held completion once it is delivered, and not one that was cleared', async () => {
        SlowHost.start();
        const before = SlowHost.heldCount;

        let ran = 0;
        clearImmediate(setImmediate(() => ran++));
        setImmediate(() => ran++);
        expect(SlowHost.heldCount).toBe(before);

        await turns(32);
        expect(ran).toBe(1);
        expect(SlowHost.heldCount).toBe(before + 1);
        expect(SlowHost.held()).toEqual([]);
    });
});
