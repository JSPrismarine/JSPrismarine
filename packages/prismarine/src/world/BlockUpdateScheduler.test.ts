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

    it('puts updates a tick ran out of time for back at the front, still due', () => {
        const scheduler = new BlockUpdateScheduler();
        scheduler.schedule(1, 0, 0, 0);
        scheduler.schedule(2, 0, 0, 0);
        scheduler.schedule(3, 0, 0, 0);

        const due = scheduler.due(1);
        expect(due).toHaveLength(3);
        // Something queued after the draw must not jump ahead of what was already waiting.
        scheduler.schedule(9, 0, 0, 1);
        scheduler.defer(due.slice(1), 1);

        expect(scheduler.size()).toBe(3);
        expect(scheduler.due(2)).toEqual([
            { x: 2, y: 0, z: 0 },
            { x: 3, y: 0, z: 0 },
            { x: 9, y: 0, z: 0 }
        ]);
    });

    it('keeps the earlier time of a position that was queued again while it was out', () => {
        const scheduler = new BlockUpdateScheduler();
        scheduler.schedule(5, 0, 0, 0);
        const due = scheduler.due(1);
        scheduler.defer(due, 1);

        expect(scheduler.due(1)).toEqual([{ x: 5, y: 0, z: 0 }]);
        expect(scheduler.size()).toBe(0);
    });
});
