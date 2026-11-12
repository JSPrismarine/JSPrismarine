import { describe, expect, it } from 'vitest';

import { insideTick, outsideTick, runInTick } from './TickContext';
import { currentTickWaitTracker, trackTickWaits } from './TickWaits';

describe('TickContext', () => {
    it('is inside a tick while the tick runs, and outside for what the tick left behind', async () => {
        const seen: boolean[] = [];
        let leftBehind: Promise<void> = Promise.resolve();

        expect(insideTick()).toBe(false);
        runInTick(() => {
            seen.push(insideTick());
            // Started by the tick and not waited for: it runs once the tick has returned.
            leftBehind = Promise.resolve().then(() => void seen.push(insideTick()));
        });
        expect(insideTick()).toBe(false);
        await leftBehind;

        expect(seen).toEqual([true, false]);
    });

    it('clears the flag for work started outside the tick, and sets it again for the rest of the tick', () => {
        const seen: boolean[] = [];
        runInTick(() => {
            outsideTick(() => void seen.push(insideTick()));
            seen.push(insideTick());
        });

        expect(seen).toEqual([false, true]);
    });

    it('starts work outside every tracker', async () => {
        const tracker = { park: () => {}, unpark: () => {} };
        const found = await trackTickWaits(tracker, () => outsideTick(async () => currentTickWaitTracker()));

        expect(found).toBeUndefined();
    });

    it('clears the flag when the tick throws', () => {
        expect(() =>
            runInTick(() => {
                throw new Error('the tick failed');
            })
        ).toThrow('the tick failed');
        expect(insideTick()).toBe(false);
    });
});
