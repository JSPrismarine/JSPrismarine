import { describe, expect, it } from 'vitest';

import {
    currentTickScope,
    currentTickWaitTracker,
    insideTick,
    outsideTick,
    runInTick,
    trackTickWaits
} from './TickContext';

describe('TickContext', () => {
    it('is inside a tick for the work the tick awaits, and outside once the tick has finished', async () => {
        let release: () => void = () => {};
        const later = new Promise<void>((resolve) => {
            release = resolve;
        });
        const seen: boolean[] = [];
        let leftBehind: Promise<void> = Promise.resolve();

        expect(insideTick()).toBe(false);
        await runInTick(async () => {
            seen.push(insideTick());
            await Promise.resolve();
            seen.push(insideTick());
            // Started by the tick and not awaited by it.
            leftBehind = later.then(() => void seen.push(insideTick()));
        });
        release();
        await leftBehind;

        expect(seen).toEqual([true, true, false]);
        expect(insideTick()).toBe(false);
    });

    it('keeps a scope that reads as closed after its tick', async () => {
        let scope: { readonly open: boolean } | undefined;
        await runInTick(async () => {
            scope = currentTickScope();
            expect(scope?.open).toBe(true);
        });

        expect(scope?.open).toBe(false);
        expect(currentTickScope()).toBeUndefined();
    });

    it('starts work outside the tick it is called from, across the awaits of that work', async () => {
        const seen: boolean[] = [];
        let started: Promise<void> = Promise.resolve();
        await runInTick(async () => {
            started = outsideTick(async () => {
                seen.push(insideTick());
                await Promise.resolve();
                seen.push(insideTick());
            });
            seen.push(insideTick());
            await started;
        });

        expect(seen).toEqual([false, true, false]);
    });

    it('hands the tracker to the work it runs, across awaits', async () => {
        const tracker = { park: () => {}, unpark: () => {} };
        const found = await trackTickWaits(tracker, async () => {
            await Promise.resolve();
            return currentTickWaitTracker();
        });

        expect(found).toBe(tracker);
        expect(currentTickWaitTracker()).toBeUndefined();
    });
});
