import { describe, expect, it } from 'vitest';
import SharedByteRing from './SharedByteRing';
import WorkerEventQueue from './WorkerEventQueue';

describe('WorkerEventQueue', () => {
    it('does not let a newer event overtake events staged during ring backpressure', () => {
        const ring = new SharedByteRing(16);
        const queue = new WorkerEventQueue(ring, 64);
        expect(queue.write([Buffer.from([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12])])).toBe(true);
        expect(queue.write([Buffer.from([20])])).toBe(true);

        expect(ring.tryRead()).toEqual(Buffer.from([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]));
        // The ring has room again, but event 2 is older and must stay ahead of event 3.
        expect(queue.write([Buffer.from([30])])).toBe(true);
        queue.drain();

        expect(ring.tryRead()).toEqual(Buffer.from([20]));
        expect(ring.tryRead()).toEqual(Buffer.from([30]));
        expect(ring.tryRead()).toBeNull();
    });
});
