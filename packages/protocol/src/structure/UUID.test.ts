import { describe, expect, it } from 'vitest';

import NetworkBinaryStream from '../NetworkBinaryStream';
import UUID from './UUID';

// Most Significant Bits: uint64 LE 2^64 - 1, then Least Significant Bits: uint64 LE 1.
const wire = Buffer.from([
    0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0x01, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00
]);

/**
 * `00112233-4455-6677-8899-aabbccddeeff`: `Most Significant Bits` 0x0011223344556677 little
 * endian, then `Least Significant Bits` 0x8899aabbccddeeff little endian. The same sixteen
 * bytes gophertunnel's `Writer.UUID` produces, which moves the low half in front of the high
 * one and reverses all sixteen.
 * {@link https://raw.githubusercontent.com/Sandertv/gophertunnel/master/minecraft/protocol/writer.go}
 */
const known = Buffer.from([
    0x77, 0x66, 0x55, 0x44, 0x33, 0x22, 0x11, 0x00, 0xff, 0xee, 0xdd, 0xcc, 0xbb, 0xaa, 0x99, 0x88
]);

describe('UUID', () => {
    it('writes a known uuid as two little endian halves, most significant first', () => {
        const stream = new NetworkBinaryStream();

        new UUID(0x0011_2233_4455_6677n, 0x8899_aabb_ccdd_eeffn).serialize(stream);

        expect(stream.getWriteBuffer()).toEqual(known);
    });

    it('reads a known uuid back into its two halves', () => {
        const uuid = UUID.deserialize(new NetworkBinaryStream(known));

        expect(uuid.most).toBe(0x0011_2233_4455_6677n);
        expect(uuid.least).toBe(0x8899_aabb_ccdd_eeffn);
    });

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
