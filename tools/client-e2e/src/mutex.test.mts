import { describe, expect, it } from 'vitest';

import { createMutex } from './mutex.mts';

describe('createMutex', () => {
    it('holds one holder at a time and serves them in the order they asked', async () => {
        const mutex = createMutex();
        const order: string[] = [];
        let holders = 0;
        let mostHolders = 0;
        const hold = async (name: string): Promise<void> => {
            const release = await mutex.acquire();
            holders++;
            mostHolders = Math.max(mostHolders, holders);
            order.push(name);
            // Give every other holder's turn a chance to start while this one holds.
            await new Promise<void>((resolve) => setImmediate(resolve));
            holders--;
            release();
        };

        await Promise.all(['a', 'b', 'c', 'd'].map(hold));

        expect(mostHolders).toBe(1);
        expect(order).toEqual(['a', 'b', 'c', 'd']);
    });

    it('keeps a later holder waiting until the earlier one releases', async () => {
        const mutex = createMutex();
        const releaseFirst = await mutex.acquire();
        let secondHeld = false;
        const second = mutex.acquire().then((release) => {
            secondHeld = true;
            return release;
        });

        await new Promise<void>((resolve) => setImmediate(resolve));
        expect(secondHeld).toBe(false);

        releaseFirst();
        (await second)();
        expect(secondHeld).toBe(true);
    });
});
