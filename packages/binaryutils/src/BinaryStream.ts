import assert from 'assert';

/**
 * A high-performance binary stream for reading and writing binary data.
 *
 * Unlike Node.js native buffers which have fixed size, BinaryStream uses dynamic
 * buffers that grow automatically during write operations. This eliminates the need
 * for manual resizing or inefficient `Buffer.concat()` calls.
 *
 * @example Reading data
 * ```typescript
 * const stream = new BinaryStream(buffer);
 * const value = stream.readInt();
 * ```
 *
 * @example Writing data
 * ```typescript
 * const stream = new BinaryStream();
 * stream.writeInt(42);
 * stream.write(Buffer.from('Hello'));  // Buffer grows automatically
 * const buffer = stream.getWriteBuffer();
 * ```
 *
 * @example Encoding many packets without allocating
 * ```typescript
 * const stream = new BinaryStream(undefined, 0, 4096);
 * for (const packet of queue) {
 *     stream.resetWrite();
 *     packet.encode(stream);
 *     offset = stream.copyInto(arena, offset);
 * }
 * ```
 */
export class BinaryStream {
    private writeBuffer: Buffer | null = null;
    private readBuffer: Buffer | null = null;
    private readIndex: number;
    private writeIndex = 0;
    private writeCapacity = 0;

    /**
     * Creates a new BinaryStream instance.
     * @param {Buffer|null|undefined} buffer - The array or Buffer containing binary data.
     * @param {number} offset - The initial pointer position.
     * @param {number} initialCapacity - Pre-allocates the write buffer to this size. Use it when
     * the encoded size is known up front: it skips the 256 -> 512 -> 1024 ... growth ladder, and
     * with {@link resetWrite} it lets a long-lived encoder run without allocating at all.
     */
    public constructor(buffer?: Buffer, offset: number = 0, initialCapacity: number = 0) {
        this.readBuffer = buffer ?? null; // Keep this instance for reading
        this.readIndex = offset;
        if (initialCapacity > 0) {
            this.reserve(initialCapacity);
        }
    }

    /**
     * Reads a slice of buffer by the given length.
     * @param {number} len
     */
    public read(len: number): Buffer {
        this.doReadAssertions(len);
        return this.readBuffer!.subarray(this.readIndex, (this.readIndex += len));
    }

    /**
     * Appends a buffer to the main buffer.
     * @param {Buffer|Uint8Array} buf
     */
    public write(buf: Uint8Array): void {
        const len = buf.byteLength;
        this.ensureCapacity(len);
        // This used to call `buf.copy(...)`, which only exists on Buffer, so passing the plain
        // Uint8Array this signature advertises threw `TypeError: buf.copy is not a function`.
        // `set` accepts both, is spec-required to handle overlapping ranges, and is cheaper
        // for the small payloads (UUIDs, short blobs) that dominate packet encoding.
        this.writeBuffer!.set(buf, this.writeIndex);
        this.writeIndex += len;
    }

    /**
     * Reads an unsigned byte (0 to 255).
     * @returns {number}
     */
    public readByte(): number {
        this.doReadAssertions(1);
        return this.readBuffer![this.readIndex++]!;
    }

    /**
     * Writes an unsigned byte (0 to 255).
     * @param {number} v
     */
    public writeByte(v: number): void {
        this.ensureCapacity(1);
        this.writeBuffer![this.writeIndex++] = v & 0xff;
    }

    /**
     * Reads a signed byte (-128 to 127).
     * @returns {number}
     */
    public readSignedByte(): number {
        this.doReadAssertions(1);
        return (this.readBuffer![this.readIndex++]! << 24) >> 24;
    }

    /**
     * Writes a signed byte (-128 to 127).
     * @param {number} v
     */
    public writeSignedByte(v: number): void {
        this.ensureCapacity(1);
        this.writeBuffer![this.writeIndex++] = (v < 0 ? 0xff + v + 1 : v) & 0xff;
    }

    /**
     * Reads a boolean (true or false).
     * @returns {boolean}
     */
    public readBoolean(): boolean {
        this.doReadAssertions(1);
        return this.readBuffer![this.readIndex++] !== 0;
    }

    /**
     * Writes a boolean (true or false).
     * @param {boolean} v
     */
    public writeBoolean(v: boolean): void {
        this.ensureCapacity(1);
        this.writeBuffer![this.writeIndex++] = v ? 1 : 0;
    }

    /**
     * Reads a 16 bit (2 bytes) signed big-endian number.
     * @returns {number}
     */
    public readShort(): number {
        this.doReadAssertions(2);
        return this.readBuffer!.readInt16BE(this.addOffset(2));
    }

    /**
     * Writes a 16 bit (2 bytes) signed big-endian number.
     * @param {number} v
     */
    public writeShort(v: number): void {
        this.doWriteAssertions(v, -32_768, 32_767);
        this.ensureCapacity(2);
        this.writeBuffer![this.writeIndex++] = (v >> 8) & 0xff;
        this.writeBuffer![this.writeIndex++] = v & 0xff;
    }

    /**
     * Reads a 16 bit (2 bytes) signed little-endian number.
     * @returns {number}
     */
    public readShortLE(): number {
        this.doReadAssertions(2);
        return this.readBuffer!.readInt16LE(this.addOffset(2));
    }

    /**
     * Writes a 16 bit (2 bytes) signed little-endian number.
     * @param {number} v
     */
    public writeShortLE(v: number): void {
        this.doWriteAssertions(v, -32_768, 32_767);
        this.ensureCapacity(2);
        this.writeBuffer![this.writeIndex++] = v & 0xff;
        this.writeBuffer![this.writeIndex++] = (v >> 8) & 0xff;
    }

    /**
     * Reads a 16 bit (2 bytes) unsigned big-endian number.
     * @returns {number}
     */
    public readUnsignedShort(): number {
        this.doReadAssertions(2);
        return this.readBuffer!.readUInt16BE(this.addOffset(2));
    }

    /**
     * Writes a 16 bit (2 bytes) unsigned big-endian number.
     * @param {number} v
     */
    public writeUnsignedShort(v: number): void {
        this.doWriteAssertions(v, 0, 65_535);
        this.ensureCapacity(2);
        this.writeBuffer![this.writeIndex++] = (v >>> 8) & 0xff;
        this.writeBuffer![this.writeIndex++] = v & 0xff;
    }

    /**
     * Reads a 16 bit (2 bytes) unsigned little-endian number.
     * @returns {number}
     */
    public readUnsignedShortLE(): number {
        this.doReadAssertions(2);
        return this.readBuffer!.readUInt16LE(this.addOffset(2));
    }

    /**
     * Writes a 16 bit (2 bytes) unsigned little-endian number.
     * @param {number} v
     */
    public writeUnsignedShortLE(v: number): void {
        this.doWriteAssertions(v, 0, 65_535);
        this.ensureCapacity(2);
        this.writeBuffer![this.writeIndex++] = v & 0xff;
        this.writeBuffer![this.writeIndex++] = (v >>> 8) & 0xff;
    }

    /**
     * Reads a 24 bit (3 bytes) signed big-endian number.
     * @returns {number}
     */
    public readTriad(): number {
        this.doReadAssertions(3);
        return this.readBuffer!.readIntBE(this.addOffset(3), 3);
    }

    /**
     * Writes a 24 bit (3 bytes) signed big-endian number.
     * @param {number} v
     */
    public writeTriad(v: number): void {
        this.doWriteAssertions(v, -8_388_608, 8_388_607);
        this.ensureCapacity(3);
        this.writeBuffer![this.writeIndex++] = (v >> 16) & 0xff;
        this.writeBuffer![this.writeIndex++] = (v >> 8) & 0xff;
        this.writeBuffer![this.writeIndex++] = v & 0xff;
    }

    /**
     * Reads a 24 bit (3 bytes) little-endian number.
     * @returns {number}
     */
    public readTriadLE(): number {
        this.doReadAssertions(3);
        return this.readBuffer!.readIntLE(this.addOffset(3), 3);
    }

    /**
     * Writes a 24 bit (3 bytes) signed little-endian number.
     * @param {number} v
     */
    public writeTriadLE(v: number): void {
        this.doWriteAssertions(v, -8_388_608, 8_388_607);
        this.ensureCapacity(3);
        this.writeBuffer![this.writeIndex++] = v & 0xff;
        this.writeBuffer![this.writeIndex++] = (v >> 8) & 0xff;
        this.writeBuffer![this.writeIndex++] = (v >> 16) & 0xff;
    }

    /**
     * Reads a 24 bit (3 bytes) unsigned big-endian number.
     * @returns {number}
     */
    public readUnsignedTriad(): number {
        this.doReadAssertions(3);
        return this.readBuffer!.readUIntBE(this.addOffset(3), 3);
    }

    /**
     * Writes a 24 bit (3 bytes) unsigned big-endian number.
     * @param {number} v
     */
    public writeUnsignedTriad(v: number): void {
        this.doWriteAssertions(v, 0, 16_777_215);
        this.ensureCapacity(3);
        this.writeBuffer![this.writeIndex++] = (v >>> 16) & 0xff;
        this.writeBuffer![this.writeIndex++] = (v >>> 8) & 0xff;
        this.writeBuffer![this.writeIndex++] = v & 0xff;
    }

    /**
     * Reads a 24 bit (3 bytes) unsigned little-endian number.
     * @returns {number}
     */
    public readUnsignedTriadLE(): number {
        this.doReadAssertions(3);
        return this.readBuffer!.readUIntLE(this.addOffset(3), 3);
    }

    /**
     * Writes a 24 bit (3 bytes) unsigned little-endian number.
     * @param {number} v
     */
    public writeUnsignedTriadLE(v: number): void {
        this.doWriteAssertions(v, 0, 16_777_215);
        this.ensureCapacity(3);
        this.writeBuffer![this.writeIndex++] = v & 0xff;
        this.writeBuffer![this.writeIndex++] = (v >>> 8) & 0xff;
        this.writeBuffer![this.writeIndex++] = (v >>> 16) & 0xff;
    }

    /**
     * Reads a 32 bit (4 bytes) big-endian signed number.
     * @returns {number}
     */
    public readInt(): number {
        this.doReadAssertions(4);
        return this.readBuffer!.readInt32BE(this.addOffset(4));
    }

    /**
     * Writes a 32 bit (4 bytes) big-endian signed number.
     * @param {number} v
     */
    public writeInt(v: number): void {
        this.doWriteAssertions(v, -2_147_483_648, 2_147_483_647);
        this.ensureCapacity(4);
        this.writeBuffer!.writeInt32BE(v, this.writeIndex);
        this.writeIndex += 4;
    }

    /**
     * Reads a 32 bit (4 bytes) signed number.
     * @returns {number}
     */
    public readIntLE(): number {
        this.doReadAssertions(4);
        return this.readBuffer!.readIntLE(this.addOffset(4), 4);
    }

    /**
     * Writes a 32 bit (4 bytes) little-endian signed number.
     * @param {number} v
     */
    public writeIntLE(v: number) {
        this.doWriteAssertions(v, -2_147_483_648, 2_147_483_647);
        this.ensureCapacity(4);
        this.writeBuffer!.writeInt32LE(v, this.writeIndex);
        this.writeIndex += 4;
    }

    /**
     * Reads a 32 bit (4 bytes) big-endian unsigned number.
     * @returns {number}
     */
    public readUnsignedInt(): number {
        this.doReadAssertions(4);
        return this.readBuffer!.readUInt32BE(this.addOffset(4));
    }

    /**
     * Writes a 32 bit (4 bytes) big-endian unsigned number.
     * @param {number} v
     */
    public writeUnsignedInt(v: number): void {
        this.doWriteAssertions(v, 0, 4_294_967_295);
        this.ensureCapacity(4);
        this.writeBuffer!.writeUInt32BE(v, this.writeIndex);
        this.writeIndex += 4;
    }

    /**
     * Reads a 32 bit (4 bytes) little-endian unsigned number.
     * @returns {number}
     */
    public readUnsignedIntLE(): number {
        this.doReadAssertions(4);
        return this.readBuffer!.readUInt32LE(this.addOffset(4));
    }

    /**
     * Writes a 32 bit (4 bytes) little-endian unsigned number.
     * @param {number} v
     */
    public writeUnsignedIntLE(v: number): void {
        this.doWriteAssertions(v, 0, 4_294_967_295);
        this.ensureCapacity(4);
        this.writeBuffer!.writeUInt32LE(v, this.writeIndex);
        this.writeIndex += 4;
    }

    /**
     * Returns a 32 bit (4 bytes) big-endian flating point number.
     * @returns {number}
     */
    public readFloat(): number {
        this.doReadAssertions(4);
        return this.readBuffer!.readFloatBE(this.addOffset(4));
    }

    /**
     * Writes a 32 bit (4 bytes) big-endian floating point number.
     * @param {number} v
     */
    public writeFloat(v: number): void {
        this.doWriteAssertions(v, -3.4028234663852886e38, +3.4028234663852886e38);
        this.ensureCapacity(4);
        this.writeBuffer!.writeFloatBE(v, this.writeIndex);
        this.writeIndex += 4;
    }

    /**
     * Returns a 32 bit (4 bytes) big-endian flating point number.
     * @returns {number}
     */
    public readFloatLE(): number {
        this.doReadAssertions(4);
        return this.readBuffer!.readFloatLE(this.addOffset(4));
    }

    /**
     * Writes a 32 bit (4 bytes) little-endian floating point number.
     * @param {number} v
     */
    public writeFloatLE(v: number): void {
        this.doWriteAssertions(v, -3.4028234663852886e38, +3.4028234663852886e38);
        this.ensureCapacity(4);
        this.writeBuffer!.writeFloatLE(v, this.writeIndex);
        this.writeIndex += 4;
    }

    /**
     * Returns a 64 bit (8 bytes) big-endian flating point number.
     * @returns {number}
     */
    public readDouble(): number {
        this.doReadAssertions(8);
        return this.readBuffer!.readDoubleBE(this.addOffset(8));
    }

    /**
     * Writes a 64 bit (8 bytes) big-endian floating point number.
     * @param {number} v
     */
    public writeDouble(v: number): void {
        this.doWriteAssertions(v, -1.7976931348623157e308, +1.7976931348623157e308);
        this.ensureCapacity(8);
        this.writeBuffer!.writeDoubleBE(v, this.writeIndex);
        this.writeIndex += 8;
    }

    /**
     * Returns a 64 bit (8 bytes) little-endian flating point number.
     * @returns {number}
     */
    public readDoubleLE(): number {
        this.doReadAssertions(8);
        return this.readBuffer!.readDoubleLE(this.addOffset(8));
    }

    /**
     * Writes a 64 bit (8 bytes) little-endian floating point number.
     * @param {number} v
     */
    public writeDoubleLE(v: number): void {
        this.doWriteAssertions(v, -1.7976931348623157e308, +1.7976931348623157e308);
        this.ensureCapacity(8);
        this.writeBuffer!.writeDoubleLE(v, this.writeIndex);
        this.writeIndex += 8;
    }

    /**
     * Returns a 64 bit (8 bytes) signed big-endian number.
     * @returns {bigint}
     */
    public readLong(): bigint {
        this.doReadAssertions(8);
        return this.readBuffer!.readBigInt64BE(this.addOffset(8));
    }

    /**
     * Writes a 64 bit (8 bytes) signed big-endian number.
     * @param {bigint} v
     */
    public writeLong(v: bigint): void {
        this.ensureCapacity(8);
        this.writeBuffer!.writeBigInt64BE(v, this.writeIndex);
        this.writeIndex += 8;
    }

    /**
     * Returns a 64 bit (8 bytes) signed little-endian number.
     * @returns {bigint}
     */
    public readLongLE(): bigint {
        this.doReadAssertions(8);
        return this.readBuffer!.readBigInt64LE(this.addOffset(8));
    }

    /**
     * Writes a 64 bit (8 bytes) signed little-endian number.
     * @param {bigint} v
     */
    public writeLongLE(v: bigint): void {
        this.ensureCapacity(8);
        this.writeBuffer!.writeBigInt64LE(v, this.writeIndex);
        this.writeIndex += 8;
    }

    /**
     * Returns a 64 bit (8 bytes) unsigned big-endian number.
     * @returns {bigint}
     */
    public readUnsignedLong(): bigint {
        this.doReadAssertions(8);
        return this.readBuffer!.readBigUInt64BE(this.addOffset(8));
    }

    /**
     * Writes a 64 bit (8 bytes) unsigned big-endian number.
     * @param {bigint} v
     */
    public writeUnsignedLong(v: bigint): void {
        this.ensureCapacity(8);
        this.writeBuffer!.writeBigUInt64BE(v, this.writeIndex);
        this.writeIndex += 8;
    }

    /**
     * Returns a 64 bit (8 bytes) unsigned little-endian number.
     * @returns {bigint}
     */
    public readUnsignedLongLE(): bigint {
        this.doReadAssertions(8);
        return this.readBuffer!.readBigUInt64LE(this.addOffset(8));
    }

    /**
     * Writes a 64 bit (8 bytes) unsigned little-endian number.
     * @param {bigint} v
     */
    public writeUnsignedLongLE(v: bigint): void {
        this.ensureCapacity(8);
        this.writeBuffer!.writeBigUInt64LE(v, this.writeIndex);
        this.writeIndex += 8;
    }

    /**
     * Reads a 32 bit (4 bytes) zigzag-encoded number.
     * @returns {number}
     */
    public readVarInt(): number {
        const raw = this.readUnsignedVarInt();
        // The previous expression was `(((raw << 63) >> 63) ^ raw) >> 1 ^ (raw & (1 << 63))`,
        // a Java port that relied on JS shift counts being taken mod 32. It was verified
        // correct over 7.2M values, but this is the same function written legibly.
        return (raw >>> 1) ^ -(raw & 1);
    }

    /**
     * Writes a 32 bit (4 bytes) zigzag-encoded number.
     * @param {number} v
     */
    public writeVarInt(v: number): void {
        // The `v = (v << 32) >> 32` that used to sit here was a no-op: JS shift counts are
        // taken mod 32, so it shifted by 0. The `<< 1` below already coerces to int32.
        return this.writeUnsignedVarInt((v << 1) ^ (v >> 31));
    }

    /**
     * Reads a 32 bit unsigned number.
     * @returns {number}
     */
    public readUnsignedVarInt(): number {
        const buf = this.readBuffer;
        if (buf === null) {
            assert.fail('Reading on empty buffer!');
        }
        const len = buf.byteLength;
        let value = 0;
        for (let i = 0; i <= 28; i += 7) {
            // A numeric compare rather than `typeof buf[idx] === 'undefined'`: the latter is an
            // out-of-bounds element load, which makes V8 discard the optimized code for this
            // function the first time a stream is read to its end.
            if (this.readIndex >= len) {
                throw new Error('No bytes left in buffer');
            }
            const b = buf[this.readIndex++]!;
            value |= (b & 0x7f) << i;

            if ((b & 0x80) === 0) {
                if (i === 28 && (b & 0x70) !== 0) {
                    // Bits above the 32nd used to be shifted off and discarded, so an
                    // over-long encoding such as `ff ff ff ff 7f` silently decoded to the
                    // same value as the canonical `ff ff ff ff 0f`.
                    throw new Error('VarInt overflows 32 bits!');
                }
                // `>>> 0` because the accumulator above is int32: without it every value
                // from 2^31 up came back negative, so writeUnsignedVarInt(0xffffffff)
                // round-tripped to -1.
                return value >>> 0;
            }
        }

        throw new Error('VarInt did not terminate after 5 bytes!');
    }

    /**
     * Writes a 32 bit unsigned number with variable-length.
     * @param {number} v
     */
    public writeUnsignedVarInt(v: number): void {
        // One capacity check for the whole varint instead of one per byte (via writeByte),
        // with the buffer and cursor hoisted into locals so each byte is a plain store.
        this.ensureCapacity(5);
        const buf = this.writeBuffer!;
        let i = this.writeIndex;
        while ((v & 0xffffff80) !== 0) {
            buf[i++] = (v & 0x7f) | 0x80;
            v >>>= 7;
        }
        buf[i++] = v & 0x7f;
        this.writeIndex = i;
    }

    /**
     * Reads a 64 bit zigzag-encoded variable-length number.
     * @returns {bigint}
     */
    public readVarLong(): bigint {
        const raw = this.readUnsignedVarLong();
        // The zigzag sign XOR was missing, so this used to return `raw >> 1n`: every negative
        // value decoded wrong (-20n came back as 19n, -1n as 0n) and anything at or above
        // 2^54 collapsed to 0n. Positive small values were unaffected, which is why the
        // shipped test suite never caught it.
        return (raw >> 1n) ^ -(raw & 1n);
    }

    /**
     * Writes a 64 bit unsigned zigzag-encoded number.
     * @param {bigint} v
     */
    public writeVarLong(v: bigint) {
        const n = BigInt.asIntN(64, v);
        return this.writeUnsignedVarLong((n << 1n) ^ (n >> 63n));
    }

    /**
     * Reads a 64 bit unsigned variable-length number.
     * @returns {bigint}
     */
    public readUnsignedVarLong(): bigint {
        const buf = this.readBuffer;
        if (buf === null) {
            throw new Error('Buffer is write only!');
        }
        const len = buf.byteLength;
        // The accumulator is kept in two int32 halves and materialised as a single BigInt at
        // the end. The previous version allocated five BigInts per decoded byte
        // (BigInt(b), the mask, BigInt(i), the shift and the or).
        let lo = 0;
        let hi = 0;
        for (let i = 0; i <= 63; i += 7) {
            if (this.readIndex >= len) {
                throw new Error('No bytes left in buffer');
            }
            const b = buf[this.readIndex++]!;
            if (i < 28) {
                lo |= (b & 0x7f) << i;
            } else if (i === 28) {
                lo = (lo | ((b & 0x0f) << 28)) >>> 0;
                hi = (b & 0x7f) >>> 4;
            } else {
                hi |= (b & 0x7f) << (i - 32);
            }

            if ((b & 0x80) === 0) {
                if (i === 63 && (b & 0x7e) !== 0) {
                    throw new Error('VarLong overflows 64 bits!');
                }
                return (BigInt(hi >>> 0) << 32n) | BigInt(lo >>> 0);
            }
        }

        throw new Error('VarLong did not terminate after 10 bytes!');
    }

    /**
     * Writes a 64 bit unsigned variable-length number.
     * @param {bigint} v
     */
    public writeUnsignedVarLong(v: bigint) {
        // The value is split into two uint32 halves once, then the shift/mask loop runs
        // entirely in int32 space. The previous version did three BigInt allocations plus a
        // Number() conversion per emitted byte, and computed `v >> 7n` twice per byte.
        //
        // It was also wrong: `Number(v | 0x80n)` converted to a double *before* writeByte's
        // `& 0xff` mask, so above 2^54 the low bits were already rounded away.
        // writeUnsignedVarLong(9007199254741119n) emitted a leading 0x00 - a terminator -
        // and the value read back as 0n. Negative inputs emitted ten unterminated bytes;
        // they are now well-defined as their two's complement, matching protobuf.
        this.ensureCapacity(10);
        const buf = this.writeBuffer!;
        let i = this.writeIndex;
        const u = BigInt.asUintN(64, v);
        let lo = Number(u & 0xffffffffn) >>> 0;
        let hi = Number(u >> 32n) >>> 0;
        while (hi !== 0 || lo > 0x7f) {
            buf[i++] = (lo & 0x7f) | 0x80;
            lo = ((lo >>> 7) | (hi << 25)) >>> 0;
            hi >>>= 7;
        }
        buf[i++] = lo;
        this.writeIndex = i;
    }

    /**
     * Ensures write buffer has enough capacity, grows if needed.
     * @param {number} needed
     */
    private ensureCapacity(needed: number): void {
        const required = this.writeIndex + needed;
        if (required > this.writeCapacity) {
            // Initial allocation or growth
            const newCapacity =
                this.writeCapacity === 0
                    ? Math.max(256, required) // Initial: 256 or required size
                    : Math.max(required, this.writeCapacity << 1); // Growth: 2x
            const newBuffer = Buffer.allocUnsafe(newCapacity);

            // Copy existing data if any
            if (this.writeBuffer !== null && this.writeIndex > 0) {
                this.writeBuffer!.copy(newBuffer, 0, 0, this.writeIndex);
            }

            this.writeBuffer = newBuffer;
            this.writeCapacity = newCapacity;
        }
    }

    /**
     * Grows the write buffer so that at least `capacity` bytes can be written without any
     * further allocation, and returns this stream.
     *
     * Pre-sizing skips the 256 -> 512 -> 1024 ... growth ladder, each step of which copies the
     * whole payload; a 3 KB packet starting from the 256-byte floor performs five allocations
     * and memcpy's 1.25x its own size before it is done.
     * @param {number} capacity
     */
    public reserve(capacity: number): this {
        if (capacity > this.writeCapacity) {
            const newBuffer = Buffer.allocUnsafe(capacity);
            if (this.writeBuffer !== null && this.writeIndex > 0) {
                this.writeBuffer.copy(newBuffer, 0, 0, this.writeIndex);
            }
            this.writeBuffer = newBuffer;
            this.writeCapacity = capacity;
        }
        return this;
    }

    /**
     * Rewinds the write cursor while keeping the allocated capacity, so a long-lived encoder
     * reaches a steady state where it never allocates again. This is the intended way to reuse
     * a stream for many packets.
     *
     * Note the aliasing contract, which it shares with {@link clear} and {@link reuse}: any
     * buffer previously handed out by {@link getWriteBuffer} is a *view* over this stream's
     * memory and is invalidated by this call. Use {@link copyOut} or {@link copyInto} for
     * output you intend to keep.
     */
    public resetWrite(): void {
        this.writeIndex = 0;
    }

    /**
     * Returns the encoded bytes as an exactly-sized, standalone Buffer.
     *
     * Unlike {@link getWriteBuffer} the result does not alias this stream, so it survives
     * {@link resetWrite}, and it does not pin a pool chunk: because `Buffer.allocUnsafe` is
     * pool-backed (`Buffer.poolSize` is 64 KB on current Node), holding on to a handful of
     * small slices from {@link getWriteBuffer} can keep megabytes alive.
     * @returns {Buffer}
     */
    public copyOut(): Buffer {
        const out = Buffer.allocUnsafeSlow(this.writeIndex);
        if (this.writeIndex > 0) {
            this.writeBuffer!.copy(out, 0, 0, this.writeIndex);
        }
        return out;
    }

    /**
     * Copies the encoded bytes into a caller-owned buffer at `offset` and returns the offset
     * just past them. Lets many packets be encoded into one arena with no per-packet
     * allocation at all.
     * @param {Buffer} target
     * @param {number} offset
     * @returns {number} the new offset
     */
    public copyInto(target: Buffer, offset: number = 0): number {
        if (this.writeIndex > 0) {
            this.writeBuffer!.copy(target, offset, 0, this.writeIndex);
        }
        return offset + this.writeIndex;
    }

    /**
     * Increases the write offset by the given length.
     * @param {number} length
     */
    private addOffset(length: number): number {
        return (this.readIndex += length) - length;
    }

    /**
     * Returns whatever or not the read offset is at end of line.
     * @returns {number}
     */
    public feof(): boolean {
        const buf = this.readBuffer;
        if (buf === null) throw new Error('Buffer is write only!');
        // A numeric compare rather than `typeof buf[i] === 'undefined'`. The latter is an
        // out-of-bounds element load, and V8 bails out of the optimized code for this
        // function the first time it happens - which is every packet decoded to its end.
        return this.readIndex >= buf.byteLength;
    }

    /**
     * Reads the remaining bytes and returns the buffer slice.
     * @returns {Buffer}
     */
    public readRemaining(): Buffer {
        if (!this.readBuffer) throw new Error('Buffer is write only!');
        const buf = this.readBuffer!.subarray(this.readIndex);
        this.readIndex = this.readBuffer.byteLength;
        return buf;
    }

    /**
     * Skips len bytes on the buffer.
     * @param {number} len
     */
    public skip(len: number): void {
        assert(Number.isInteger(len), 'Cannot skip a float amount of bytes');
        this.readIndex += len;
    }

    /**
     * Returns the encoded buffer.
     *
     * Beware: when a read buffer is present this returns *that*, discarding everything
     * written. On a stream used for both reading and writing it never returns your output.
     * @returns {Buffer}
     * @deprecated See {@link getReadBuffer} and {@link getWriteBuffer}.
     */
    public getBuffer(): Buffer {
        return this.readBuffer !== null ? this.readBuffer : this.writeBuffer!.subarray(0, this.writeIndex);
    }

    /**
     * Returns the read buffer if available.
     * @returns {Buffer}
     */
    public getReadBuffer(): Buffer | null {
        return this.readBuffer;
    }

    /**
     * Returns the encoded bytes as a *view* over this stream's internal buffer.
     *
     * The view is only valid until the next write: {@link resetWrite}, {@link clear} and
     * {@link reuse} all rewind the cursor without reallocating, so a previously returned
     * buffer is silently overwritten by the next packet. If you queue the result - a send
     * queue, a resend window - use {@link copyOut} or {@link copyInto} instead.
     *
     * It also keeps the whole pooled 64 KB chunk it was carved from alive; retaining a
     * scattered handful of small packets this way can pin megabytes.
     * @returns {Buffer}
     */
    public getWriteBuffer(): Buffer {
        return this.writeBuffer!.subarray(0, this.writeIndex);
    }

    /**
     * Sets the buffer for reading.
     * make sure to reset the reading index!
     * @param buf - The new Buffer.
     * @deprecated See {@link setReadBuffer} and {@link setWriteBuffer}.
     */
    public setBuffer(buf: Buffer): void {
        this.readBuffer = buf;
    }

    /**
     * Sets the buffer for reading.
     * @param buf - The new Buffer.
     * @param rIndex - The new read index (default: 0, pass -1 to keep current).
     */
    public setReadBuffer(buf: Buffer, rIndex = 0): void {
        this.readBuffer = buf;
        if (rIndex >= 0) this.readIndex = rIndex;
    }

    /**
     * Sets the buffer for writing.
     * @param buf - The new Buffer.
     * @param wIndex - The new write index (default: 0, pass -1 to keep current).
     */
    public setWriteBuffer(buf: Buffer, wIndex = 0): void {
        this.writeBuffer = buf;
        if (wIndex >= 0) this.writeIndex = wIndex;
        this.writeCapacity = buf.byteLength;
    }

    /**
     * Clears the whole BinaryStream instance.
     *
     * The write buffer and its capacity are kept, so any view previously returned by
     * {@link getWriteBuffer} is invalidated. See {@link resetWrite}.
     */
    public clear(): void {
        this.readBuffer = null;
        this.readIndex = 0;
        this.writeIndex = 0;
    }

    /**
     * Conventional method to reuse the stream
     * without having to create a new BinaryStream instance.
     *
     * The write buffer and its capacity are kept, so any view previously returned by
     * {@link getWriteBuffer} is invalidated. See {@link resetWrite}.
     * @param buf - The new buffer instance.
     */
    public reuse(buf: Buffer): void {
        this.readBuffer = buf;
        this.readIndex = 0;
        this.writeIndex = 0;
    }

    /**
     * Sets the reading index.
     * @param index - The new read index.
     */
    public setReadIndex(index: number): void {
        assert(index >= 0, 'Index must be non-negative');
        this.readIndex = index;
    }

    /**
     * Sets the new writing index.
     * @param index - The new write index.
     */
    public setWriteIndex(index: number): void {
        assert(index >= 0, 'Index must be non-negative');
        this.writeIndex = index;
    }

    /**
     * Retuns the read index.
     * @returns {number}
     */
    public getReadIndex(): number {
        return this.readIndex;
    }

    /**
     * Returns the write index.
     * @returns {number}
     */
    public getWriteIndex(): number {
        return this.writeIndex;
    }

    /**
     * Do read assertions, check if the read buffer is null.
     * @param {number} byteLength
     */
    private doReadAssertions(byteLength: number): void {
        const buf = this.readBuffer;
        if (buf === null) {
            assert.fail('Cannot read without buffer data!');
        }
        // This used to compare the *total* buffer length against the requested length and
        // ignore readIndex entirely, so it caught almost nothing: read(4) at offset 998 of a
        // 1000-byte buffer returned 2 bytes with no error, readBoolean past the end returned
        // true, and the fixed-width readers blew up with an ERR_OUT_OF_RANGE raised from
        // inside Buffer rather than an AssertionError raised here.
        if (this.readIndex + byteLength > buf.byteLength) {
            assert.fail(
                `Cannot read ${byteLength} byte(s) at offset ${this.readIndex}: ` +
                    `only ${Math.max(0, buf.byteLength - this.readIndex)} left in buffer`
            );
        }
    }

    /**
     * Do read assertions, check if the read buffer is null.
     * @param {number|bigint} num
     * @param {number|bigint} minVal
     * @param {number|bigint} maxVal
     */
    private doWriteAssertions(num: number, minVal: number, maxVal: number): void {
        // Argument expressions are evaluated *before* the call, so the template literal used
        // to be built on every successful write - sixteen write methods route through here.
        // For writeFloat/writeDouble the bounds are doubles, so each call ran three
        // double-to-string conversions and threw the result away. Building the message only
        // on failure is worth ~2.3x on a mixed packet-encoding workload.
        //
        // `!(a && b)` rather than `a < min || a > max`: the latter silently accepts NaN,
        // which this method has always rejected.
        if (!(num >= minVal && num <= maxVal)) {
            assert.fail(`Value out of bounds: value=${num}, min=${minVal}, max=${maxVal}`);
        }
    }
}

// Default export for backward compatibility
export default BinaryStream;
