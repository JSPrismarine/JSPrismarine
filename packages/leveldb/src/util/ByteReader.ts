/**
 * A cursor over a Buffer.
 *
 * Every accessor returns a non-optional value and throws when the buffer is too short, which is
 * what keeps the format code free of `buf[i]!`. Under `noUncheckedIndexedAccess` a raw index is
 * `number | undefined`, and the non-null assertions needed to silence that would also silence a
 * genuine truncation - exactly the bug class a database reader must never paper over.
 */
export class ByteReader {
    private readonly buffer: Buffer;
    private offset: number;
    private readonly end: number;

    public constructor(buffer: Buffer, offset = 0, length = buffer.byteLength - offset) {
        this.buffer = buffer;
        this.offset = offset;
        this.end = offset + length;
    }

    public get position(): number {
        return this.offset;
    }

    public set position(value: number) {
        if (value < 0 || value > this.end) {
            throw new RangeError(`Position ${value} is outside the readable range`);
        }

        this.offset = value;
    }

    public get remaining(): number {
        return this.end - this.offset;
    }

    public get exhausted(): boolean {
        return this.offset >= this.end;
    }

    private require(bytes: number): number {
        if (this.remaining < bytes) {
            throw new RangeError(`Expected ${bytes} more bytes, ${this.remaining} left`);
        }

        const at = this.offset;
        this.offset += bytes;
        return at;
    }

    public u8(): number {
        return this.buffer.readUInt8(this.require(1));
    }

    public i8(): number {
        return this.buffer.readInt8(this.require(1));
    }

    public u16(): number {
        return this.buffer.readUInt16LE(this.require(2));
    }

    public u32(): number {
        return this.buffer.readUInt32LE(this.require(4));
    }

    public i32(): number {
        return this.buffer.readInt32LE(this.require(4));
    }

    public u64(): bigint {
        return this.buffer.readBigUInt64LE(this.require(8));
    }

    /** A view, not a copy. Callers that retain the result past the reader's lifetime must copy. */
    public bytes(length: number): Buffer {
        const at = this.require(length);
        return this.buffer.subarray(at, at + length);
    }

    /**
     * LevelDB's 32 bit varint: 7 bits per byte, low group first, at most 5 bytes. The result is
     * returned unsigned, which is what every 32 bit varint in the format means - lengths, offsets
     * and file numbers are all counts.
     */
    public varint32(): number {
        let result = 0;
        for (let shift = 0; shift <= 28; shift += 7) {
            const byte = this.u8();
            // `>>> 0` because `1 << 28` sets the sign bit once the low groups are or-ed in.
            result = (result | ((byte & 0x7f) << shift)) >>> 0;
            if ((byte & 0x80) === 0) {
                return result;
            }
        }

        throw new RangeError('Varint32 did not terminate within 5 bytes');
    }

    /** The 64 bit varint, up to 10 bytes. Used for sequence numbers, which exceed 2^53. */
    public varint64(): bigint {
        let result = 0n;
        for (let shift = 0n; shift <= 63n; shift += 7n) {
            const byte = this.u8();
            result |= BigInt(byte & 0x7f) << shift;
            if ((byte & 0x80) === 0) {
                return result;
            }
        }

        throw new RangeError('Varint64 did not terminate within 10 bytes');
    }

    /** A varint32 length followed by that many bytes. LevelDB calls this a length-prefixed slice. */
    public lengthPrefixed(): Buffer {
        return this.bytes(this.varint32());
    }
}

export default ByteReader;
