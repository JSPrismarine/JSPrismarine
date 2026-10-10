/**
 * A growable byte buffer.
 *
 * Deliberately not `@jsprismarine/binaryutils`: its `write()` is `this.binary = [...this.binary,
 * ...buf]`, which is quadratic in the number of writes and allocates a JS number array along the
 * way. A single 2 MiB table is built from tens of thousands of writes, so that shape is not usable
 * here. This one doubles a real Buffer instead.
 */
export class ByteWriter {
    private buffer: Buffer;
    private offset = 0;

    public constructor(initialCapacity = 1024) {
        this.buffer = Buffer.allocUnsafe(Math.max(initialCapacity, 16));
    }

    public get length(): number {
        return this.offset;
    }

    private reserve(bytes: number): number {
        const needed = this.offset + bytes;
        if (needed > this.buffer.byteLength) {
            let capacity = this.buffer.byteLength * 2;
            while (capacity < needed) capacity *= 2;

            const grown = Buffer.allocUnsafe(capacity);
            this.buffer.copy(grown, 0, 0, this.offset);
            this.buffer = grown;
        }

        const at = this.offset;
        this.offset += bytes;
        return at;
    }

    // Each of these reserves on its own line. Inlining the call as an argument would read
    // `this.buffer` before `reserve` runs, so a write that triggered a growth would land in the
    // buffer that was just replaced.

    public u8(value: number): this {
        const at = this.reserve(1);
        this.buffer.writeUInt8(value & 0xff, at);
        return this;
    }

    public i8(value: number): this {
        const at = this.reserve(1);
        this.buffer.writeInt8(value, at);
        return this;
    }

    public u16(value: number): this {
        const at = this.reserve(2);
        this.buffer.writeUInt16LE(value & 0xffff, at);
        return this;
    }

    public u32(value: number): this {
        const at = this.reserve(4);
        // `>>> 0` so a value that arrived as a signed int32 - a masked CRC, say - still writes.
        this.buffer.writeUInt32LE(value >>> 0, at);
        return this;
    }

    public i32(value: number): this {
        const at = this.reserve(4);
        this.buffer.writeInt32LE(value, at);
        return this;
    }

    public u64(value: bigint): this {
        const at = this.reserve(8);
        this.buffer.writeBigUInt64LE(BigInt.asUintN(64, value), at);
        return this;
    }

    public bytes(value: Buffer): this {
        const at = this.reserve(value.byteLength);
        value.copy(this.buffer, at);
        return this;
    }

    public varint32(value: number): this {
        let remaining = value >>> 0;
        while (remaining >= 0x80) {
            this.u8((remaining & 0x7f) | 0x80);
            remaining >>>= 7;
        }

        return this.u8(remaining);
    }

    public varint64(value: bigint): this {
        let remaining = BigInt.asUintN(64, value);
        while (remaining >= 0x80n) {
            this.u8(Number(remaining & 0x7fn) | 0x80);
            remaining >>= 7n;
        }

        return this.u8(Number(remaining));
    }

    public lengthPrefixed(value: Buffer): this {
        return this.varint32(value.byteLength).bytes(value);
    }

    /** A copy, so the writer can keep growing without the caller's buffer changing underneath it. */
    public finish(): Buffer {
        return Buffer.from(this.buffer.subarray(0, this.offset));
    }

    /** Drops everything written so far, keeping the allocated capacity. */
    public reset(): void {
        this.offset = 0;
    }
}

export default ByteWriter;
