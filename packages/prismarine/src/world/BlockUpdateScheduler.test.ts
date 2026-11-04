import { describe, expect, it } from 'vitest';

import { BlockUpdateScheduler } from './BlockUpdateScheduler';

describe('BlockUpdateScheduler', () => {
    it('snapshots due ticks and positions in processing order', () => {
        const scheduler = new BlockUpdateScheduler();
        scheduler.schedule(1, 2, 3, 10, 4);
        scheduler.schedule(4, 5, 6, 10, 1);
        // An earlier retry updates the due tick in place without moving the existing queue entry.
        scheduler.schedule(1, 2, 3, 10, 2);

        const snapshot = scheduler.snapshot();
        expect(snapshot).toEqual([
            { dueTick: 12, position: { x: 1, y: 2, z: 3 } },
            { dueTick: 11, position: { x: 4, y: 5, z: 6 } }
        ]);
        snapshot[0]!.position.x = 99;
        expect(scheduler.snapshot()[0]!.position.x).toBe(1);
        expect(scheduler.due(20)).toEqual([
            { x: 1, y: 2, z: 3 },
            { x: 4, y: 5, z: 6 }
        ]);
    });
});
