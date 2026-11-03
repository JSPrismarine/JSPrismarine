import { describe, expect, it } from 'vitest';
import SharedByteRing from './SharedByteRing';

describe('SharedByteRing', () => {
    it('preserves records and their part order across the physical end of the ring', () => {
        const ring = new SharedByteRing(16);

        expect(ring.tryWriteParts([Buffer.from('abc'), Buffer.from('de')])).toBe(true);
        expect(ring.tryRead()?.toString()).toBe('abcde');
        expect(ring.tryWriteParts([Buffer.from('1234567')])).toBe(true);
        expect(ring.tryRead()?.toString()).toBe('1234567');
        expect(ring.tryRead()).toBeNull();
    });

    it('reports bounded backpressure without overwriting queued data', () => {
        const ring = new SharedByteRing(8);

        expect(ring.tryWriteParts([Buffer.from('full')])).toBe(true);
        expect(ring.tryWriteParts([Buffer.from('x')])).toBe(false);
        expect(ring.getMetrics()).toMatchObject({
            capacity: 8,
            queuedBytes: 8,
            highWatermarkBytes: 8,
            fullWrites: 1
        });
        expect(ring.tryRead()?.toString()).toBe('full');
        expect(ring.tryWriteParts([Buffer.from('x')])).toBe(true);
        expect(ring.tryRead()?.toString()).toBe('x');
    });

    it('shares queue state with an attached ring', () => {
        const producer = new SharedByteRing(32);
        const consumer = new SharedByteRing(32, producer.memory);

        expect(producer.tryWriteParts([Buffer.from([1, 2, 3])])).toBe(true);
        expect(consumer.tryRead()).toEqual(Buffer.from([1, 2, 3]));
        expect(producer.getMetrics().queuedBytes).toBe(0);
    });
});
