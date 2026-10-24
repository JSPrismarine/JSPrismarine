import { describe, expect, it } from 'vitest';

import NetworkBinaryStream from '../NetworkBinaryStream';
import UUID from './UUID';

// Most Significant Bits: uint64 LE 2^64 - 1, then Least Significant Bits: uint64 LE 1.
const wire = Buffer.from([
    0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0x01, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00
]);

describe('UUID', () => {
    it('writes a half at or above 2^63 without throwing', () => {
        const stream = new NetworkBinaryStream();

        expect(() => new UUID(0xffff_ffff_ffff_ffffn, 1n).serialize(stream)).not.toThrow();
        expect(stream.getBuffer()).toEqual(wire);
    });

    it('reads both halves as unsigned and consumes the buffer', () => {
        const stream = new NetworkBinaryStream(wire);
        const uuid = UUID.deserialize(stream);

        expect(uuid.most).toBe(0xffff_ffff_ffff_ffffn);
        expect(uuid.least).toBe(1n);
        expect(stream.feof()).toBe(true);
    });
});
