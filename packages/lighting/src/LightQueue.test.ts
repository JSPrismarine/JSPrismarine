import { describe, expect, it } from 'vitest';

import { columnKeyOf } from './coordinates';
import { LightQueue } from './LightQueue';

/** The x of every node a queue still holds, oldest first; empties the queue. */
const drain = (queue: LightQueue): number[] => {
    const seen: number[] = [];
    for (let node = queue.shift(); node !== undefined; node = queue.shift()) seen.push(node.x);
    return seen;
};

describe('LightQueue shift', () => {
    it('empties the column that has waited longest before it starts the next', () => {
        const queue = new LightQueue();
        for (const x of [40, 0, 41, 1, 100]) queue.push(x, 0, 0);

        expect(queue.size).toBe(5);
        expect(drain(queue)).toEqual([40, 41, 0, 1, 100]);
        expect(queue.size).toBe(0);
    });

    it('hands a node pushed to the column it is emptying out after the nodes already there', () => {
        const queue = new LightQueue();
        queue.push(0, 0, 0);
        queue.push(40, 0, 0);

        expect(queue.shift()?.x).toBe(0);
        queue.push(1, 0, 0);

        // The first column ran out, so the node waits behind the column that was already queued.
        expect(drain(queue)).toEqual([40, 1]);
    });
});

describe('LightQueue takeWithin', () => {
    it('takes the nodes of the chunk rectangle, each column oldest first, and leaves the rest queued', () => {
        const queue = new LightQueue();
        for (const x of [0, 40, 17, 100, 3, 33]) queue.push(x, 0, 0);

        const taken: number[] = [];
        const count = queue.takeWithin(0, 1, 0, 0, (node) => taken.push(node.x));

        expect(count).toBe(3);
        expect(taken).toEqual([0, 3, 17]);
        expect(queue.size).toBe(3);
        expect(drain(queue)).toEqual([40, 33, 100]);
    });

    it('gives each column a turn before any column a second one', () => {
        const queue = new LightQueue();
        queue.push(0, 0, 0);
        queue.push(16, 0, 0);

        // Each node queues the next block along in its own column, three steps deep.
        const taken: number[] = [];
        queue.takeWithin(0, 1, 0, 0, (node) => {
            taken.push(node.x);
            if ((node.x & 15) < 2) queue.push(node.x + 1, 0, 0);
        });

        expect(taken).toEqual([0, 16, 1, 17, 2, 18]);
    });

    it('takes the nodes its visitor queues inside the rectangle, and not those outside', () => {
        const queue = new LightQueue();
        queue.push(1, 0, 0);

        const taken: number[] = [];
        queue.takeWithin(0, 0, 0, 0, (node) => {
            taken.push(node.x);
            if (node.x < 4) {
                queue.push(node.x + 1, 0, 0);
                queue.push(node.x + 64, 0, 0);
            }
        });

        expect(taken).toEqual([1, 2, 3, 4]);
        expect(drain(queue)).toEqual([65, 66, 67]);
    });

    it('hands over no more than its limit and leaves the rest of the rectangle queued', () => {
        const queue = new LightQueue();
        for (const x of [0, 1, 40, 2, 3]) queue.push(x, 0, 0);

        const taken: number[] = [];
        expect(queue.takeWithin(0, 0, 0, 0, (node) => taken.push(node.x), 2)).toBe(2);

        expect(taken).toEqual([0, 1]);
        expect(drain(queue)).toEqual([2, 3, 40]);
    });

    it('keeps the per column counts in step with what it takes', () => {
        const counts = new Map<number, number>();
        const queue = new LightQueue(counts);
        queue.push(0, 0, 0);
        queue.push(1, 0, 0);
        queue.push(16, 0, 0);

        queue.takeWithin(0, 0, 0, 0, () => {});

        expect(counts.has(columnKeyOf(0, 0))).toBe(false);
        expect(counts.get(columnKeyOf(1, 0))).toBe(1);
    });

    it('is empty once everything it held was taken', () => {
        const queue = new LightQueue();
        queue.push(0, 0, 0);
        queue.push(1, 0, 0);

        queue.takeWithin(0, 0, 0, 0, () => {});

        expect(queue.size).toBe(0);
        expect(queue.shift()).toBeUndefined();

        queue.push(5, 0, 0, 7);
        expect(queue.size).toBe(1);
        expect(queue.shift()).toMatchObject({ x: 5, level: 7 });
    });
});
