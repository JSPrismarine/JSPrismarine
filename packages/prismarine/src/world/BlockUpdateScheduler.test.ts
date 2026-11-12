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

describe('BlockUpdateScheduler changes', () => {
    it('reports each position queued, moved earlier and taken off, and restoring them reaches the same queue in the same order', () => {
        const live = new BlockUpdateScheduler();
        const changes: [number, number, number, number | null, number | null][] = [];
        live.observer = (x, y, z, before, after) => void changes.push([x, y, z, before, after]);
        live.schedule(1, 64, 1, 10, 4);
        live.scheduleAround(0, 64, 0, 10, 2);
        // Later than the queued time, so nothing changes and nothing is reported.
        live.schedule(1, 64, 1, 10, 9);
        live.schedule(0, 64, 0, 10, 1);
        live.due(11);

        expect(changes).toEqual([
            [1, 64, 1, null, 14],
            [0, 64, 0, null, 12],
            [1, 64, 0, null, 12],
            [-1, 64, 0, null, 12],
            [0, 65, 0, null, 12],
            [0, 63, 0, null, 12],
            [0, 64, 1, null, 12],
            [0, 64, -1, null, 12],
            [0, 64, 0, 12, 11],
            [0, 64, 0, 11, null]
        ]);

        const replayed = new BlockUpdateScheduler();
        let reported = 0;
        replayed.observer = () => void (reported += 1);
        for (const [x, y, z, , after] of changes) replayed.restore(x, y, z, after);

        expect(reported).toBe(0);
        expect(replayed.snapshot()).toEqual(live.snapshot());
        expect(replayed.due(14)).toEqual(live.due(14));
    });

    it('goes back to where it was by restoring the before-values, newest first', () => {
        const scheduler = new BlockUpdateScheduler();
        scheduler.schedule(0, 64, 0, 10, 5);
        const before = scheduler.snapshot();
        const changes: [number, number, number, number | null][] = [];
        scheduler.observer = (x, y, z, was) => void changes.push([x, y, z, was]);
        scheduler.scheduleAround(0, 64, 0, 10, 1);
        for (const [x, y, z, was] of changes.reverse()) scheduler.restore(x, y, z, was);

        expect(scheduler.snapshot()).toEqual(before);
        expect(scheduler.due(15)).toEqual([{ x: 0, y: 64, z: 0 }]);
    });
});
