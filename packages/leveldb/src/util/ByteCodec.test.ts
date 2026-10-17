import { describe, expect, it } from 'vitest';

import { ByteReader } from './ByteReader';
import { ByteWriter } from './ByteWriter';

describe('leveldb', () => {
    describe('byte codec', () => {
        it('round-trips every fixed width field', () => {
            const written = new ByteWriter()
                .u8(0xfe)
                .i8(-2)
                .u16(0xbeef)
                .u32(0xdeadbeef)
                .i32(-2147483648)
                .u64(0xfedcba9876543210n)
                .finish();

            const reader = new ByteReader(written);

            expect(reader.u8()).toBe(0xfe);
            expect(reader.i8()).toBe(-2);
            expect(reader.u16()).toBe(0xbeef);
            expect(reader.u32()).toBe(0xdeadbeef);
            expect(reader.i32()).toBe(-2147483648);
            expect(reader.u64()).toBe(0xfedcba9876543210n);
            expect(reader.exhausted).toBe(true);
        });

        it('round-trips varint32 across every byte-length boundary', () => {
            // The values either side of each 7 bit group, plus the top of the range: 0x80000000
            // and up is where a signed shift would flip the result negative.
            const values = [0, 1, 127, 128, 16383, 16384, 2097151, 2097152, 268435455, 268435456, 0xffffffff];

            for (const value of values) {
                const reader = new ByteReader(new ByteWriter().varint32(value).finish());
                expect(reader.varint32()).toBe(value);
                expect(reader.exhausted).toBe(true);
            }
        });

        it('writes varint32 in as few bytes as the value needs', () => {
            expect(new ByteWriter().varint32(0).length).toBe(1);
            expect(new ByteWriter().varint32(127).length).toBe(1);
            expect(new ByteWriter().varint32(128).length).toBe(2);
            expect(new ByteWriter().varint32(0xffffffff).length).toBe(5);
        });

        it('round-trips varint64 past what a double can hold', () => {
            const values = [0n, 1n, 127n, 128n, 0xffffffffn, 0x1fffffffffffffn, 0xfffffffffffffffn, (1n << 64n) - 1n];

            for (const value of values) {
                const reader = new ByteReader(new ByteWriter().varint64(value).finish());
                expect(reader.varint64()).toBe(value);
                expect(reader.exhausted).toBe(true);
            }
        });

        it('round-trips a length-prefixed slice', () => {
            const payload = Buffer.from('minecraft:oak_log');
            const reader = new ByteReader(new ByteWriter().lengthPrefixed(payload).finish());

            expect(reader.lengthPrefixed()).toEqual(payload);
            expect(reader.exhausted).toBe(true);
        });

        it('round-trips an empty slice', () => {
            const reader = new ByteReader(new ByteWriter().lengthPrefixed(Buffer.alloc(0)).finish());

            expect(reader.lengthPrefixed().byteLength).toBe(0);
        });

        it('grows past its initial capacity without losing anything', () => {
            const writer = new ByteWriter(16);
            for (let i = 0; i < 5000; i++) writer.u32(i);

            const reader = new ByteReader(writer.finish());
            for (let i = 0; i < 5000; i++) expect(reader.u32()).toBe(i);
            expect(reader.exhausted).toBe(true);
        });

        it('hands out a view, and finish hands out a copy', () => {
            const writer = new ByteWriter();
            writer.bytes(Buffer.from([1, 2, 3]));
            const first = writer.finish();
            writer.bytes(Buffer.from([4]));

            // `finish` must not alias the writer's own storage, or a caller holding an earlier
            // result would see it change as more gets written.
            expect(first).toEqual(Buffer.from([1, 2, 3]));
            expect(writer.finish()).toEqual(Buffer.from([1, 2, 3, 4]));
        });

        describe('truncation', () => {
            it('refuses to read past the end', () => {
                const reader = new ByteReader(Buffer.from([1, 2]));
                expect(() => reader.u32()).toThrow(RangeError);
            });

            it('refuses a varint32 that never terminates', () => {
                const reader = new ByteReader(Buffer.from([0x80, 0x80, 0x80, 0x80, 0x80, 0x80]));
                expect(() => reader.varint32()).toThrow(/terminate/);
            });

            it('refuses a slice longer than what is left', () => {
                const reader = new ByteReader(new ByteWriter().varint32(64).u8(1).finish());
                expect(() => reader.lengthPrefixed()).toThrow(RangeError);
            });
        });

        describe('windowing', () => {
            it('reads only the window it was given', () => {
                const reader = new ByteReader(Buffer.from([9, 9, 1, 2, 3, 9]), 2, 3);

                expect(reader.remaining).toBe(3);
                expect(reader.bytes(3)).toEqual(Buffer.from([1, 2, 3]));
                expect(reader.exhausted).toBe(true);
                expect(() => reader.u8()).toThrow(RangeError);
            });

            it('can be repositioned inside its window', () => {
                // Block readers seek to a restart point and decode forward from there.
                const reader = new ByteReader(Buffer.from([1, 2, 3, 4]));
                reader.u32();
                reader.position = 2;

                expect(reader.u8()).toBe(3);
            });

            it('refuses a position outside its window', () => {
                const reader = new ByteReader(Buffer.from([1, 2, 3, 4]), 1, 2);
                expect(() => (reader.position = 4)).toThrow(RangeError);
            });
        });
    });
});
