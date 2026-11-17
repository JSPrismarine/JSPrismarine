import { describe, expect, it } from 'vitest';

import { TaskQueue } from './tasks';

/** Runs a tick's due tasks and returns their names, in the order they ran. */
const runTick = (queue: TaskQueue<string>, tick: number, during?: (name: string) => void): string[] => {
    const ran: string[] = [];
    queue.runDue(tick, (task) => {
        ran.push(task.callback);
        during?.(task.callback);
    });
    return ran;
};

describe('TaskQueue', () => {
    // The orders below are the ones the `system-tasks` golden recorded on BDS.
    it('runs the tasks due in a tick in the order they were queued', () => {
        const queue = new TaskQueue<string>();
        queue.schedule('run', 'run A', 0);
        queue.schedule('timeout', 'timeout 2', 0, 2);
        queue.schedule('run', 'run B', 0);
        queue.schedule('timeout', 'timeout 0', 0, 0);

        expect(runTick(queue, 0)).toEqual(['run A', 'run B', 'timeout 0']);
        expect(runTick(queue, 1)).toEqual([]);
        expect(runTick(queue, 2)).toEqual(['timeout 2']);
    });

    it('holds a run a running task queues for the next tick, and runs a timeout of 0 in this one', () => {
        const queue = new TaskQueue<string>();
        queue.schedule('run', 'outer', 0);
        queue.schedule('run', 'second', 0);

        const first = runTick(queue, 0, (name) => {
            if (name !== 'outer') return;
            queue.schedule('run', 'nested run', 0);
            queue.schedule('timeout', 'nested timeout 0', 0, 0);
        });
        expect(first).toEqual(['outer', 'second', 'nested timeout 0']);
        expect(runTick(queue, 1)).toEqual(['nested run']);
    });

    it('runs an interval first after its interval, then every interval, an interval of 0 every tick', () => {
        const queue = new TaskQueue<string>();
        queue.schedule('interval', 'every 0', 0, 0);
        queue.schedule('interval', 'every 3', 0, 3);

        const ticks = [0, 1, 2, 3, 4, 5, 6].map((tick) => runTick(queue, tick));
        expect(ticks).toEqual([
            ['every 0'],
            ['every 0'],
            ['every 0'],
            ['every 0', 'every 3'],
            ['every 0'],
            ['every 0'],
            ['every 0', 'every 3']
        ]);
    });

    it('never runs a cleared task again, even when an interval clears itself', () => {
        const queue = new TaskQueue<string>();
        const timeout = queue.schedule('timeout', 'cleared', 0, 1);
        const interval = queue.schedule('interval', 'self clearing', 0, 0);
        expect(queue.clear(timeout)?.callback).toBe('cleared');
        expect(queue.clear(timeout)).toBeUndefined();

        expect(runTick(queue, 0, () => queue.clear(interval))).toEqual(['self clearing']);
        expect(runTick(queue, 1)).toEqual([]);
    });

    it('refuses a delay that is not a finite number, which would never fall due', () => {
        const queue = new TaskQueue<string>();
        for (const delay of [Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY]) {
            expect(() => queue.schedule('interval', 'never', 0, delay)).toThrow(RangeError);
        }
        expect(queue.hasDue(0)).toBe(false);
        expect(queue.schedule('run', 'first id', 0)).toBe(1);
    });

    it('leaves the tasks a stopped pass did not reach queued and still due', () => {
        const queue = new TaskQueue<string>();
        for (const name of ['a', 'b', 'c']) queue.schedule('timeout', name, 0, 0);
        let allowed = 2;
        const ran: string[] = [];
        queue.runDue(
            0,
            (task) => ran.push(task.callback),
            () => allowed-- > 0
        );

        expect(ran).toEqual(['a', 'b']);
        expect(runTick(queue, 1)).toEqual(['c']);
    });

    it('hands out ids from 1 that grow by one', () => {
        const queue = new TaskQueue<string>();
        expect([
            queue.schedule('run', 'a', 0),
            queue.schedule('timeout', 'b', 0, 5),
            queue.schedule('interval', 'c', 0)
        ]).toEqual([1, 2, 3]);
    });
});
