import { describe, expect, it } from 'vitest';

import ChunkSender from './ChunkSender';

/** Drains a queue completely, returning the order chunks came out in. */
const drain = (sender: ChunkSender) => {
    const order: Array<[number, number]> = [];
    for (let next = sender.next(); next !== null; next = sender.next()) order.push([next.x, next.z]);

    return order;
};

const distanceFrom =
    (cx: number, cz: number) =>
    ([x, z]: [number, number]) =>
        (x - cx) ** 2 + (z - cz) ** 2;

describe('network', () => {
    describe('ChunkSender', () => {
        it('hands out the nearest chunk first', () => {
            const sender = new ChunkSender();
            sender.setCenter(0, 0);

            for (const [x, z] of [
                [5, 5],
                [1, 0],
                [3, 3],
                [0, 1],
                [2, 2]
            ])
                sender.enqueue(x!, z!);

            const distances = drain(sender).map(distanceFrom(0, 0));
            expect(distances).toEqual([...distances].sort((a, b) => a - b));
        });

        it('re-orders around the player once they move', () => {
            // A player walking east should start receiving what is east of them, not keep
            // working through what they left behind.
            const sender = new ChunkSender();
            sender.setCenter(0, 0);
            for (let x = -5; x <= 5; x++) sender.enqueue(x, 0);

            sender.setCenter(5, 0);
            const first = sender.next()!;

            expect(first.x).toBe(5);
        });

        it('ignores a chunk already waiting', () => {
            const sender = new ChunkSender();
            sender.enqueue(1, 1);
            sender.enqueue(1, 1);
            sender.enqueue(1, 1);

            expect(sender.size).toBe(1);
        });

        it('knows what it is holding', () => {
            const sender = new ChunkSender();
            sender.enqueue(2, 3);

            expect(sender.has(2, 3)).toBe(true);
            expect(sender.has(3, 2)).toBe(false);

            sender.next();
            expect(sender.has(2, 3)).toBe(false);
        });

        it('forgets a chunk the player walked away from', () => {
            const sender = new ChunkSender();
            sender.enqueue(1, 1);
            sender.enqueue(2, 2);

            sender.forget(1, 1);

            expect(sender.size).toBe(1);
            expect(drain(sender)).toEqual([[2, 2]]);
        });

        it('accepts a chunk again once it has been handed out', () => {
            const sender = new ChunkSender();
            sender.enqueue(4, 4);
            sender.next();

            sender.enqueue(4, 4);
            expect(sender.size).toBe(1);
        });

        it('reports empty, and answers null, when there is nothing left', () => {
            const sender = new ChunkSender();
            expect(sender.isEmpty()).toBe(true);
            expect(sender.next()).toBeNull();

            sender.enqueue(0, 0);
            expect(sender.isEmpty()).toBe(false);
            sender.next();
            expect(sender.isEmpty()).toBe(true);
        });

        it('loses nothing across a full drain', () => {
            const sender = new ChunkSender();
            sender.setCenter(0, 0);

            const expected = new Set<string>();
            for (let x = -3; x <= 3; x++) {
                for (let z = -3; z <= 3; z++) {
                    sender.enqueue(x, z);
                    expected.add(`${x},${z}`);
                }
            }

            const seen = drain(sender).map(([x, z]) => `${x},${z}`);
            expect(new Set(seen)).toEqual(expected);
            expect(seen.length).toBe(expected.size); // and none twice
        });
    });
});
