import { describe, expect, it } from 'vitest';

import { BinaryStream } from './BinaryStream';

/**
 * Regression coverage for defects that the original suite could not catch, because it only
 * exercised small positive values. Each block names the behaviour that used to be wrong.
 */

/** Independent reference LEB128 encoder, written from the spec rather than from the library. */
function refUnsignedVarLong(value: bigint): Buffer {
    let v = BigInt.asUintN(64, value);
    const out: number[] = [];
    do {
        let byte = Number(v & 0x7fn);
        v >>= 7n;
        if (v !== 0n) byte |= 0x80;
        out.push(byte);
    } while (v !== 0n);
    return Buffer.from(out);
}

function refUnsignedVarInt(value: number): Buffer {
    let v = value >>> 0;
    const out: number[] = [];
    do {
        let byte = v & 0x7f;
        v >>>= 7;
        if (v !== 0) byte |= 0x80;
        out.push(byte);
    } while (v !== 0);
    return Buffer.from(out);
}

const roundTrip = <T>(write: (s: BinaryStream) => void, read: (s: BinaryStream) => T): T => {
    const w = new BinaryStream();
    write(w);
    return read(new BinaryStream(w.getWriteBuffer()));
};

describe('VarLong', () => {
    // readVarLong() dropped the zigzag sign XOR and returned `raw >> 1n`, so every negative
    // value decoded wrong (-20n -> 19n) and large values collapsed to 0n.
    it.each([
        0n,
        1n,
        -1n,
        20n,
        -20n,
        127n,
        -128n,
        422_212_465_606_656n,
        -422_212_465_606_656n,
        2n ** 53n,
        -(2n ** 53n),
        2n ** 62n,
        9_223_372_036_854_775_807n,
        -9_223_372_036_854_775_808n
    ])('round-trips the signed value %s', (v) => {
        expect(
            roundTrip(
                (s) => s.writeVarLong(v),
                (s) => s.readVarLong()
            )
        ).toBe(v);
    });

    it('round-trips a fuzz of signed 64 bit values', () => {
        for (let i = 0; i < 5_000; i++) {
            const v = BigInt.asIntN(
                64,
                (BigInt(Math.floor(Math.random() * 2 ** 32)) << 32n) | BigInt(Math.floor(Math.random() * 2 ** 32))
            );
            expect(
                roundTrip(
                    (s) => s.writeVarLong(v),
                    (s) => s.readVarLong()
                )
            ).toBe(v);
        }
    });
});

describe('Unsigned VarLong', () => {
    // `Number(v | 0x80n)` rounded away the low bits before writeByte's `& 0xff` mask, so above
    // 2^54 the emitted bytes were corrupt: 9007199254741119n started with 0x00 - a terminator -
    // and read back as 0n.
    it.each([
        0n,
        1n,
        127n,
        128n,
        16_383n,
        2n ** 53n - 1n,
        2n ** 53n,
        9_007_199_254_741_119n,
        81_985_529_216_486_895n,
        2n ** 60n,
        18_446_744_073_709_551_615n
    ])('encodes %s exactly as the reference encoder does', (v) => {
        const w = new BinaryStream();
        w.writeUnsignedVarLong(v);
        expect(w.getWriteBuffer()).toStrictEqual(refUnsignedVarLong(v));
        expect(
            roundTrip(
                (s) => s.writeUnsignedVarLong(v),
                (s) => s.readUnsignedVarLong()
            )
        ).toBe(v);
    });

    it("encodes a negative bigint as its two's complement instead of emitting an unterminated run", () => {
        // Used to emit ten bytes all with the continuation bit set, which no decoder can read.
        const w = new BinaryStream();
        w.writeUnsignedVarLong(-1n);
        expect(w.getWriteBuffer()).toStrictEqual(refUnsignedVarLong(-1n));
        expect(new BinaryStream(w.getWriteBuffer()).readUnsignedVarLong()).toBe(18_446_744_073_709_551_615n);
    });

    it('rejects an over-long encoding rather than silently truncating it', () => {
        const overlong = Buffer.from([0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0x7f]);
        expect(() => new BinaryStream(overlong).readUnsignedVarLong()).toThrow('VarLong overflows 64 bits!');
    });

    it('throws when the buffer ends mid-value', () => {
        expect(() => new BinaryStream(Buffer.from([0x80, 0x80])).readUnsignedVarLong()).toThrow(
            'No bytes left in buffer'
        );
    });
});

describe('VarInt', () => {
    it.each([0, 1, -1, 63, 64, -64, 1_000, -1_000, 1_000_000, -1_000_000, 2_147_483_647, -2_147_483_648])(
        'round-trips the signed value %s',
        (v) => {
            expect(
                roundTrip(
                    (s) => s.writeVarInt(v),
                    (s) => s.readVarInt()
                )
            ).toBe(v);
        }
    );

    it('round-trips a fuzz of signed 32 bit values', () => {
        for (let i = 0; i < 20_000; i++) {
            const v = (Math.random() * 4_294_967_296 - 2_147_483_648) | 0;
            expect(
                roundTrip(
                    (s) => s.writeVarInt(v),
                    (s) => s.readVarInt()
                )
            ).toBe(v);
        }
    });
});

describe('Unsigned VarInt', () => {
    // The accumulator was an int32 and was returned as-is, so everything from 2^31 up came back
    // negative: writeUnsignedVarInt(0xffffffff) round-tripped to -1.
    it.each([0, 1, 127, 128, 16_383, 2_147_483_647, 2_147_483_648, 4_294_967_295])(
        'encodes %s exactly as the reference encoder does and returns it unsigned',
        (v) => {
            const w = new BinaryStream();
            w.writeUnsignedVarInt(v);
            expect(w.getWriteBuffer()).toStrictEqual(refUnsignedVarInt(v));
            expect(
                roundTrip(
                    (s) => s.writeUnsignedVarInt(v),
                    (s) => s.readUnsignedVarInt()
                )
            ).toBe(v);
        }
    );

    it('rejects an over-long encoding rather than aliasing it onto a canonical value', () => {
        // `ff ff ff ff 7f` used to decode to the same value as the canonical `ff ff ff ff 0f`.
        expect(() => new BinaryStream(Buffer.from([0xff, 0xff, 0xff, 0xff, 0x7f])).readUnsignedVarInt()).toThrow(
            'VarInt overflows 32 bits!'
        );
    });

    it('throws when the varint never terminates', () => {
        expect(() => new BinaryStream(Buffer.from([0x80, 0x80, 0x80, 0x80, 0x80, 0x80])).readUnsignedVarInt()).toThrow(
            'VarInt did not terminate after 5 bytes!'
        );
    });
});

describe('Read bounds', () => {
    // doReadAssertions compared the total buffer length against the requested length and ignored
    // readIndex, so reads near the end short-read or threw from inside Buffer.
    it('rejects a short read instead of silently returning fewer bytes', () => {
        const s = new BinaryStream(Buffer.alloc(1_000));
        s.skip(998);
        expect(() => s.read(4)).toThrow(/only 2 left in buffer/);
    });

    it.each([
        ['readByte', (s: BinaryStream) => s.readByte()],
        ['readSignedByte', (s: BinaryStream) => s.readSignedByte()],
        ['readBoolean', (s: BinaryStream) => s.readBoolean()],
        ['readShort', (s: BinaryStream) => s.readShort()],
        ['readInt', (s: BinaryStream) => s.readInt()],
        ['readFloat', (s: BinaryStream) => s.readFloat()],
        ['readDouble', (s: BinaryStream) => s.readDouble()],
        ['readLong', (s: BinaryStream) => s.readLong()],
        ['readTriad', (s: BinaryStream) => s.readTriad()]
    ])('%s throws past the end of the buffer', (_name, read) => {
        const s = new BinaryStream(Buffer.from([0x01, 0x02]));
        s.skip(2);
        expect(() => read(s)).toThrow(/left in buffer/);
    });

    it('allows a read that ends exactly at the last byte', () => {
        const s = new BinaryStream(Buffer.from([0x00, 0x00, 0x00, 0x2a]));
        expect(s.readInt()).toBe(42);
        expect(s.feof()).toBe(true);
    });

    it('reports feof without reading out of bounds', () => {
        const s = new BinaryStream(Buffer.from([0x01]));
        expect(s.feof()).toBe(false);
        expect(s.readByte()).toBe(1);
        expect(s.feof()).toBe(true);
    });
});

describe('write()', () => {
    it('accepts the plain Uint8Array its signature advertises', () => {
        // Used to throw `TypeError: buf.copy is not a function`.
        const w = new BinaryStream();
        w.write(new Uint8Array([1, 2, 3]));
        expect(w.getWriteBuffer()).toStrictEqual(Buffer.from([1, 2, 3]));
    });

    it('still accepts a Buffer', () => {
        const w = new BinaryStream();
        w.write(Buffer.from('lorem', 'utf-8'));
        expect(w.getWriteBuffer().toString('utf-8')).toBe('lorem');
    });
});

describe('Write bounds assertions', () => {
    it('still rejects NaN', () => {
        expect(() => new BinaryStream().writeShort(NaN)).toThrow(/Value out of bounds/);
        expect(() => new BinaryStream().writeInt(NaN)).toThrow(/Value out of bounds/);
    });

    it.each([
        ['writeShort', (s: BinaryStream) => s.writeShort(32_768)],
        ['writeUnsignedShort', (s: BinaryStream) => s.writeUnsignedShort(-1)],
        ['writeTriad', (s: BinaryStream) => s.writeTriad(8_388_608)],
        ['writeInt', (s: BinaryStream) => s.writeInt(2_147_483_648)],
        ['writeUnsignedInt', (s: BinaryStream) => s.writeUnsignedInt(-1)]
    ])('%s still rejects out-of-range values', (_name, write) => {
        expect(() => write(new BinaryStream())).toThrow(/Value out of bounds/);
    });
});

describe('Reuse API', () => {
    it('resetWrite keeps capacity and rewinds the cursor', () => {
        const s = new BinaryStream(undefined, 0, 4_096);
        s.writeInt(0x1111_1111);
        expect(s.getWriteIndex()).toBe(4);
        s.resetWrite();
        expect(s.getWriteIndex()).toBe(0);
        s.writeInt(0x2222_2222);
        expect(s.getWriteBuffer()).toStrictEqual(Buffer.from([0x22, 0x22, 0x22, 0x22]));
    });

    it('copyOut survives a reset, unlike the view returned by getWriteBuffer', () => {
        const s = new BinaryStream();
        s.writeInt(0x1111_1111);
        const view = s.getWriteBuffer();
        const copy = s.copyOut();

        s.resetWrite();
        s.writeInt(0x2222_2222);

        expect(copy.toString('hex')).toBe('11111111');
        expect(view.toString('hex')).toBe('22222222'); // documented aliasing behaviour
    });

    it('copyOut returns an exactly-sized standalone buffer', () => {
        const s = new BinaryStream(undefined, 0, 4_096);
        s.writeInt(1);
        const out = s.copyOut();
        expect(out.byteLength).toBe(4);
        expect(out.buffer.byteLength).toBe(4); // not a slice of a shared pool chunk
    });

    it('copyInto packs many packets into one arena', () => {
        const arena = Buffer.alloc(64);
        const s = new BinaryStream(undefined, 0, 256);
        let offset = 0;
        for (let i = 1; i <= 4; i++) {
            s.resetWrite();
            s.writeByte(i);
            s.writeByte(i * 2);
            offset = s.copyInto(arena, offset);
        }
        expect(offset).toBe(8);
        expect(arena.subarray(0, 8)).toStrictEqual(Buffer.from([1, 2, 2, 4, 3, 6, 4, 8]));
    });

    it('reserve pre-sizes without disturbing already written bytes', () => {
        const s = new BinaryStream();
        s.writeInt(0x0102_0304);
        s.reserve(8_192);
        s.writeInt(0x0506_0708);
        expect(s.getWriteBuffer().toString('hex')).toBe('0102030405060708');
    });

    it('the constructor capacity does not disturb reading', () => {
        const s = new BinaryStream(Buffer.from([0x2a]), 0, 1_024);
        expect(s.readByte()).toBe(42);
    });
});

describe('Round-trip fuzz across every fixed-width accessor', () => {
    const rnd = (n: number) => Math.floor(Math.random() * n);

    it('round-trips a mixed stream 2000 times', () => {
        for (let n = 0; n < 2_000; n++) {
            const byte = rnd(256);
            const short = rnd(65_536) - 32_768;
            const triad = rnd(16_777_216) - 8_388_608;
            const int = (Math.random() * 4_294_967_296 - 2_147_483_648) | 0;
            const uint = rnd(4_294_967_296);
            const dbl = (Math.random() - 0.5) * 1e12;
            const long = BigInt.asIntN(64, BigInt(rnd(2 ** 32)) << 32n);

            const w = new BinaryStream();
            w.writeByte(byte);
            w.writeShort(short);
            w.writeShortLE(short);
            w.writeTriad(triad);
            w.writeTriadLE(triad);
            w.writeInt(int);
            w.writeIntLE(int);
            w.writeUnsignedInt(uint);
            w.writeUnsignedIntLE(uint);
            w.writeDouble(dbl);
            w.writeDoubleLE(dbl);
            w.writeLong(long);
            w.writeLongLE(long);

            const r = new BinaryStream(w.getWriteBuffer());
            expect(r.readByte()).toBe(byte);
            expect(r.readShort()).toBe(short);
            expect(r.readShortLE()).toBe(short);
            expect(r.readTriad()).toBe(triad);
            expect(r.readTriadLE()).toBe(triad);
            expect(r.readInt()).toBe(int);
            expect(r.readIntLE()).toBe(int);
            expect(r.readUnsignedInt()).toBe(uint);
            expect(r.readUnsignedIntLE()).toBe(uint);
            expect(r.readDouble()).toBe(dbl);
            expect(r.readDoubleLE()).toBe(dbl);
            expect(r.readLong()).toBe(long);
            expect(r.readLongLE()).toBe(long);
            expect(r.feof()).toBe(true);
        }
    });

    it('preserves finite float edge values bit-for-bit, including -0', () => {
        for (const v of [0, -0, 1.5, -1.5, 5e-324, 3.4028234663852886e38, 1.7976931348623157e308]) {
            const w = new BinaryStream();
            w.writeDouble(v);
            expect(Object.is(new BinaryStream(w.getWriteBuffer()).readDouble(), v)).toBe(true);
        }
    });

    it('still rejects the non-finite values the range check has always excluded', () => {
        // Unchanged behaviour: the bounds are finite doubles, so +-Infinity fall outside them
        // and NaN fails both comparisons. Worth pinning, because the rewritten assertion uses
        // `!(a && b)` precisely to keep the NaN case throwing.
        for (const v of [Infinity, -Infinity, NaN]) {
            expect(() => new BinaryStream().writeDouble(v)).toThrow(/Value out of bounds/);
            expect(() => new BinaryStream().writeFloat(v)).toThrow(/Value out of bounds/);
        }
    });
});
