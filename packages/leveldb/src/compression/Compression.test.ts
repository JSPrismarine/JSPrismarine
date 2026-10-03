import zlib from 'node:zlib';

import { describe, expect, it } from 'vitest';

import { CompressionType, compress, decompress, isCompressionType } from './Compression';
import { SnappyError, snappyDecompress } from './Snappy';

/**
 * Snappy streams assembled by hand from the format description rather than captured from a
 * compressor, so what they pin is the spec itself. There is no encoder here to round-trip
 * against - we only ever write ZlibRaw.
 * @see https://github.com/google/snappy/blob/main/format_description.txt
 */
const literal = (payload: Buffer): Buffer => {
    const length = payload.byteLength;
    if (length <= 60) {
        return Buffer.concat([Buffer.from([(length - 1) << 2]), payload]);
    }

    // 60..63 in the tag's length field mean the real length follows in that many bytes minus 59,
    // little endian. 304 bytes therefore needs two, not one.
    const encoded = length - 1;
    const extra = encoded < 0x100 ? 1 : encoded < 0x10000 ? 2 : encoded < 0x1000000 ? 3 : 4;
    const header = Buffer.alloc(1 + extra);
    header.writeUInt8((59 + extra) << 2, 0);
    for (let i = 0; i < extra; i++) header.writeUInt8((encoded >>> (8 * i)) & 0xff, 1 + i);

    return Buffer.concat([header, payload]);
};

/** Lengths 4..11, offsets under 2048 - the tag has three bits for each. */
const copy1 = (offset: number, length: number): Buffer => {
    if (length < 4 || length > 11) throw new Error(`copy1 cannot encode length ${length}`);
    if (offset < 1 || offset > 2047) throw new Error(`copy1 cannot encode offset ${offset}`);

    return Buffer.from([((offset >>> 8) << 5) | ((length - 4) << 2) | 0x01, offset & 0xff]);
};

/** Lengths 1..64, offsets under 65536. */
const copy2 = (offset: number, length: number): Buffer => {
    if (length < 1 || length > 64) throw new Error(`copy2 cannot encode length ${length}`);
    if (offset < 1 || offset > 0xffff) throw new Error(`copy2 cannot encode offset ${offset}`);

    const buffer = Buffer.alloc(3);
    buffer.writeUInt8(((length - 1) << 2) | 0x02, 0);
    buffer.writeUInt16LE(offset, 1);
    return buffer;
};

/** Lengths 1..64, any 32 bit offset. */
const copy4 = (offset: number, length: number): Buffer => {
    if (length < 1 || length > 64) throw new Error(`copy4 cannot encode length ${length}`);

    const buffer = Buffer.alloc(5);
    buffer.writeUInt8(((length - 1) << 2) | 0x03, 0);
    buffer.writeUInt32LE(offset, 1);
    return buffer;
};

const varint = (value: number): Buffer => {
    const bytes: number[] = [];
    let remaining = value;
    while (remaining >= 0x80) {
        bytes.push((remaining & 0x7f) | 0x80);
        remaining >>>= 7;
    }

    bytes.push(remaining);
    return Buffer.from(bytes);
};

const stream = (uncompressedLength: number, ...parts: Buffer[]): Buffer =>
    Buffer.concat([varint(uncompressedLength), ...parts]);

describe('leveldb', () => {
    describe('snappy', () => {
        it('decodes a short literal', () => {
            expect(snappyDecompress(stream(5, literal(Buffer.from('hello'))))).toEqual(Buffer.from('hello'));
        });

        it('decodes an empty stream', () => {
            expect(snappyDecompress(stream(0))).toEqual(Buffer.alloc(0));
        });

        it('decodes a literal whose length needs its own byte', () => {
            const payload = Buffer.from('m'.repeat(100));
            expect(snappyDecompress(stream(100, literal(payload)))).toEqual(payload);
        });

        it('decodes a one byte copy', () => {
            // "abc" then nine bytes copied from three back: the copy reads bytes it is itself
            // writing, which is how snappy expresses a repeat.
            const decoded = snappyDecompress(stream(12, literal(Buffer.from('abc')), copy1(3, 9)));

            expect(decoded).toEqual(Buffer.from('abcabcabcabc'));
        });

        it('decodes a one byte copy whose offset needs the tag bits', () => {
            const prefix = Buffer.from('x'.repeat(300) + 'MARK');
            const decoded = snappyDecompress(stream(prefix.byteLength + 4, literal(prefix), copy1(4, 4)));

            expect(decoded.subarray(-8)).toEqual(Buffer.from('MARKMARK'));
        });

        it('decodes a two byte copy', () => {
            const prefix = Buffer.from('needle' + 'y'.repeat(200));
            const decoded = snappyDecompress(
                stream(prefix.byteLength + 6, literal(prefix), copy2(prefix.byteLength, 6))
            );

            expect(decoded.subarray(-6)).toEqual(Buffer.from('needle'));
        });

        it('decodes a four byte copy', () => {
            const prefix = Buffer.from('needle' + 'z'.repeat(200));
            const decoded = snappyDecompress(
                stream(prefix.byteLength + 6, literal(prefix), copy4(prefix.byteLength, 6))
            );

            expect(decoded.subarray(-6)).toEqual(Buffer.from('needle'));
        });

        it('decodes several tags in a row', () => {
            const decoded = snappyDecompress(
                stream(16, literal(Buffer.from('ab')), copy1(2, 4), literal(Buffer.from('cd')), copy1(8, 8))
            );

            expect(decoded).toEqual(Buffer.from('abababcd' + 'abababcd'));
        });

        describe('malformed input', () => {
            it('rejects a copy that reaches before the start of the output', () => {
                expect(() => snappyDecompress(stream(8, literal(Buffer.from('ab')), copy1(9, 6)))).toThrow(SnappyError);
            });

            it('rejects a copy with a zero offset', () => {
                // Hand-assembled, since `copy1` refuses to build it: tag 0x09 is a one byte copy
                // of length 6, and the offset byte that follows is zero. A zero offset would mean
                // "start copying from where we are", which never terminates.
                const malformed = Buffer.concat([stream(8, literal(Buffer.from('ab'))), Buffer.from([0x09, 0x00])]);

                expect(() => snappyDecompress(malformed)).toThrow(SnappyError);
            });

            it('rejects a truncated literal', () => {
                expect(() => snappyDecompress(Buffer.from([0x05, 0x10, 0x68, 0x69]))).toThrow(SnappyError);
            });

            it('rejects a stream that does not fill its declared length', () => {
                expect(() => snappyDecompress(stream(64, literal(Buffer.from('short'))))).toThrow(/declared/);
            });

            it('rejects a length prefix that never terminates', () => {
                expect(() => snappyDecompress(Buffer.from([0x80, 0x80, 0x80, 0x80, 0x80]))).toThrow(SnappyError);
            });
        });
    });

    describe('compression', () => {
        const payload = Buffer.from('minecraft:stone'.repeat(500));

        it('recognises exactly the four types the format defines', () => {
            expect([0, 1, 2, 4].every(isCompressionType)).toBe(true);
            expect([3, 5, 255, -1].some(isCompressionType)).toBe(false);
        });

        it('round-trips raw deflate, which is what the game writes', () => {
            const { type, data } = compress(CompressionType.ZlibRaw, payload);

            expect(type).toBe(CompressionType.ZlibRaw);
            expect(decompress(type, data)).toEqual(payload);
        });

        it('round-trips zlib', () => {
            const { type, data } = compress(CompressionType.Zlib, payload);

            expect(decompress(type, data)).toEqual(payload);
        });

        it('passes uncompressed blocks straight through', () => {
            expect(decompress(CompressionType.None, payload)).toEqual(payload);
        });

        it('reads a raw deflate block produced outside this package', () => {
            // A block written by the game arrives with no zlib header and no Adler-32 trailer,
            // because the block's own CRC-32C already covers it.
            expect(decompress(CompressionType.ZlibRaw, zlib.deflateRawSync(payload))).toEqual(payload);
        });

        it('stores a block that does not compress rather than growing it', () => {
            // Already-compressed bytes: deflating these costs more than it saves, and a table
            // block full of them is common once the values are themselves compressed payloads.
            const noise = zlib.deflateRawSync(
                Buffer.from(Array.from({ length: 8192 }, (_, i) => ((i * 2654435761) >>> 7) & 0xff)),
                { level: 9 }
            );

            const { type, data } = compress(CompressionType.ZlibRaw, noise);

            expect(type).toBe(CompressionType.None);
            expect(data.byteLength).toBe(noise.byteLength);
        });

        it('refuses to produce snappy', () => {
            expect(() => compress(CompressionType.Snappy, payload)).toThrow(/not implemented/);
        });

        it('refuses an unknown type on the way in', () => {
            expect(() => decompress(3 as CompressionType, payload)).toThrow(/Unknown block compression type/);
        });
    });
});
