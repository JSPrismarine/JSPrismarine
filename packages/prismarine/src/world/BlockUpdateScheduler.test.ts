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

describe('BlockUpdateScheduler as a unit journal', () => {
    it('takes back what an undone unit scheduled, and keeps what was there before it', () => {
        const scheduler = new BlockUpdateScheduler();
        scheduler.schedule(0, 64, 0, 10, 5);
        const before = scheduler.snapshot();

        const mark = scheduler.markUnit();
        scheduler.scheduleAround(0, 64, 0, 10, 1);
        scheduler.revertUnit(mark);
        scheduler.settleUnits();

        expect(scheduler.snapshot()).toEqual(before);
        expect(scheduler.due(15)).toEqual([{ x: 0, y: 64, z: 0 }]);
    });

    it('undoes only the inner unit when units nest', () => {
        const scheduler = new BlockUpdateScheduler();
        const outer = scheduler.markUnit();
        scheduler.schedule(1, 64, 1, 0);
        const inner = scheduler.markUnit();
        scheduler.schedule(2, 64, 2, 0);
        scheduler.revertUnit(inner);

        expect(scheduler.snapshot().map(({ position }) => position)).toEqual([{ x: 1, y: 64, z: 1 }]);
        scheduler.revertUnit(outer);
        expect(scheduler.size()).toBe(0);
    });

    it('records nothing outside units', () => {
        const scheduler = new BlockUpdateScheduler();
        scheduler.schedule(1, 64, 1, 0);
        scheduler.revertUnit(0);

        expect(scheduler.size()).toBe(1);
    });
});
