import { describe, expect, it } from 'vitest';

import { currentTickWaitTracker, trackTickWaits } from './TickWaits';

describe('TickWaits', () => {
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
