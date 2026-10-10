import { describe, expect, it } from 'vitest';

import { BinaryStream } from './BinaryStream';

/**
 * Allocation regression gate.
 *
 * Wall-clock benchmarks are too noisy to assert on in CI. Allocation counts are not: they are
 * deterministic, and they are what actually decides whether an encoder can hold a tick budget,
 * because every buffer allocated here is garbage the collector has to walk later.
 *
 * See `npm run bench` for the throughput numbers these counts stand in for.
 */
function countAllocations(fn: () => void): { calls: number; bytes: number } {
    const realUnsafe = Buffer.allocUnsafe;
    const realSlow = Buffer.allocUnsafeSlow;
    let calls = 0;
    let bytes = 0;
    Buffer.allocUnsafe = ((size: number) => {
        calls++;
        bytes += size;
        return realUnsafe.call(Buffer, size);
    }) as typeof Buffer.allocUnsafe;
    Buffer.allocUnsafeSlow = ((size: number) => {
        calls++;
        bytes += size;
        return realSlow.call(Buffer, size);
    }) as typeof Buffer.allocUnsafeSlow;
    try {
        fn();
    } finally {
        Buffer.allocUnsafe = realUnsafe;
        Buffer.allocUnsafeSlow = realSlow;
    }
    return { calls, bytes };
}

const encodePacket = (s: BinaryStream): void => {
    s.writeUnsignedVarInt(19);
    s.writeUnsignedVarLong(4242n);
    s.writeFloatLE(1.5);
    s.writeFloatLE(64);
    s.writeFloatLE(-2.25);
    s.writeByte(1);
    s.writeBoolean(true);
    s.writeUnsignedVarInt(9001);
};

describe('Allocation behaviour', () => {
    it('a reused pre-sized stream reaches a zero-allocation steady state', () => {
        const s = new BinaryStream(undefined, 0, 4096);
        const arena = Buffer.alloc(1 << 16);
        encodePacket(s); // warm: the constructor already reserved, so this must not allocate

        const { calls } = countAllocations(() => {
            let offset = 0;
            for (let i = 0; i < 1000; i++) {
                s.resetWrite();
                encodePacket(s);
                if (offset + 64 > arena.byteLength) offset = 0;
                offset = s.copyInto(arena, offset);
            }
        });

        expect(calls).toBe(0);
    });

    it('a pre-sized stream allocates exactly once, in the constructor', () => {
        const { calls, bytes } = countAllocations(() => {
            const s = new BinaryStream(undefined, 0, 2048);
            for (let i = 0; i < 100; i++) {
                s.resetWrite();
                encodePacket(s);
            }
        });

        expect(calls).toBe(1);
        expect(bytes).toBe(2048);
    });

    it('reserve() skips the growth ladder for a known payload size', () => {
        const ladder = countAllocations(() => {
            const s = new BinaryStream();
            for (let i = 0; i < 3072; i++) s.writeByte(i & 0xff);
        });
        const presized = countAllocations(() => {
            const s = new BinaryStream(undefined, 0, 3072);
            for (let i = 0; i < 3072; i++) s.writeByte(i & 0xff);
        });

        // 256 -> 512 -> 1024 -> 2048 -> 4096
        expect(ladder.calls).toBe(5);
        expect(ladder.bytes).toBe(7936);
        expect(presized.calls).toBe(1);
        expect(presized.bytes).toBe(3072);
    });

    it('encoding one packet on a fresh stream costs exactly one allocation', () => {
        const { calls, bytes } = countAllocations(() => {
            const s = new BinaryStream();
            encodePacket(s);
            s.getWriteBuffer();
        });

        // The growth policy must not regress into allocating per field.
        expect(calls).toBe(1);
        expect(bytes).toBe(256);
    });

    it('varints grow the buffer once per doubling, never per byte', () => {
        // writeUnsignedVarInt reserves the whole 5-byte worst case up front instead of going
        // through writeByte once per byte. Three maximal varints are 15 bytes, so starting from
        // a capacity of 8 there must be exactly one growth on top of the constructor's own
        // allocation - not one per byte written past the boundary.
        const { calls, bytes } = countAllocations(() => {
            const s = new BinaryStream(undefined, 0, 8);
            s.writeUnsignedVarInt(0xffffffff);
            s.writeUnsignedVarInt(0xffffffff);
            s.writeUnsignedVarInt(0xffffffff);
            expect(s.getWriteIndex()).toBe(15);
        });

        expect(calls).toBe(2); // reserve(8) in the constructor, then one doubling to 16
        expect(bytes).toBe(24);
    });

    it('a maximal varlong reserves its ten bytes in one step', () => {
        const { calls } = countAllocations(() => {
            const s = new BinaryStream(undefined, 0, 32);
            s.writeUnsignedVarLong(18_446_744_073_709_551_615n);
            s.writeUnsignedVarLong(18_446_744_073_709_551_615n);
            s.writeUnsignedVarLong(18_446_744_073_709_551_615n);
            expect(s.getWriteIndex()).toBe(30);
        });

        expect(calls).toBe(1); // fits in the reserved 32 bytes, so nothing beyond the constructor
    });

    it('copyOut() returns memory that does not pin a shared pool chunk', () => {
        const s = new BinaryStream();
        encodePacket(s);

        const view = s.getWriteBuffer();
        const copy = s.copyOut();

        // The view is carved out of Buffer's shared pool, so it keeps the whole chunk alive.
        expect(view.buffer.byteLength).toBeGreaterThan(view.byteLength);
        // The copy owns exactly its own bytes.
        expect(copy.buffer.byteLength).toBe(copy.byteLength);
    });
});
