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
 * stream.writeString("Hello");  // Buffer grows automatically
 * const buffer = stream.getWriteBuffer();
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
     */
    public constructor(buffer?: Buffer, offset: number = 0) {
        this.readBuffer = buffer ?? null; // Keep this instance for reading
        this.readIndex = offset;
    }

    /**
     * Reads a slice of buffer by the given length.
     * @param {number} len
     */
    public read(len: number): Buffer {
        this.doReadAssertions(len);
        return this.readBuffer!.subarray(
            this.readIndex,
            (this.readIndex += len)
        );
    }

    /**
     * Appends a buffer to the main buffer.
     * @param {Buffer|Uint8Array} buf
     */
    public write(buf: Uint8Array): void;
    public write(buf: Buffer): void {
        this.ensureCapacity(buf.byteLength);
        buf.copy(this.writeBuffer!, this.writeIndex);
        this.writeIndex += buf.byteLength;
    }

    /**
     * Reads an unsigned byte (0 to 255).
     * @returns {number}
     */
    public readByte(): number {
        this.doReadAssertions(1);
        return this.readBuffer!.readUInt8(this.readIndex++);
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
        return this.readBuffer!.readInt8(this.readIndex++);
    }

    /**
     * Writes a signed byte (-128 to 127).
     * @param {number} v
     */
    public writeSignedByte(v: number): void {
        this.ensureCapacity(1);
        this.writeBuffer![this.writeIndex++] =
            (v < 0 ? 0xff + v + 1 : v) & 0xff;
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
        this.doWriteAssertions(
            v,
            -3.4028234663852886e38,
            +3.4028234663852886e38
        );
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
        this.doWriteAssertions(
            v,
            -3.4028234663852886e38,
            +3.4028234663852886e38
        );
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
        this.doWriteAssertions(
            v,
            -1.7976931348623157e308,
            +1.7976931348623157e308
        );
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
        this.doWriteAssertions(
            v,
            -1.7976931348623157e308,
            +1.7976931348623157e308
        );
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
        const temp = (((raw << 63) >> 63) ^ raw) >> 1;
        return temp ^ (raw & (1 << 63));
    }

    /**
     * Writes a 32 bit (4 bytes) zigzag-encoded number.
     * @param {number} v
     */
    public writeVarInt(v: number): void {
        v = (v << 32) >> 32;
        return this.writeUnsignedVarInt((v << 1) ^ (v >> 31));
    }

    /**
     * Reads a 32 bit unsigned number.
     * @returns {number}
     */
    public readUnsignedVarInt(): number {
        assert(this.readBuffer != null, 'Reading on empty buffer!');
        let value = 0;
        for (let i = 0; i <= 28; i += 7) {
            if (typeof this.readBuffer![this.readIndex] === 'undefined') {
                throw new Error('No bytes left in buffer');
            }
            const b = this.readBuffer![this.readIndex++];
            value |= (b & 0x7f) << i;

            if ((b & 0x80) === 0) {
                return value;
            }
        }

        throw new Error('VarInt did not terminate after 5 bytes!');
    }

    /**
     * Writes a 32 bit unsigned number with variable-length.
     * @param {number} v
     */
    public writeUnsignedVarInt(v: number): void {
        while ((v & 0xffffff80) !== 0) {
            this.writeByte((v & 0x7f) | 0x80);
            v >>>= 7;
        }
        this.writeByte(v & 0x7f);
    }

    /**
     * Reads a 64 bit zigzag-encoded variable-length number.
     * @returns {bigint}
     */
    public readVarLong(): bigint {
        const raw = this.readUnsignedVarLong();
        return raw >> 1n;
    }

    /**
     * Writes a 64 bit unsigned zigzag-encoded number.
     * @param {bigint} v
     */
    public writeVarLong(v: bigint) {
        return this.writeUnsignedVarLong((v << 1n) ^ (v >> 63n));
    }

    /**
     * Reads a 64 bit unsigned variable-length number.
     * @returns {bigint}
     */
    public readUnsignedVarLong(): bigint {
        let value = 0n;
        for (let i = 0; i <= 63; i += 7) {
            if (this.feof()) {
                throw new Error('No bytes left in buffer');
            }
            const b = this.readBuffer![this.readIndex++];
            value |= (BigInt(b) & 0x7fn) << BigInt(i);

            if ((b & 0x80) === 0) {
                return value;
            }
        }

        throw new Error('VarLong did not terminate after 10 bytes!');
    }

    /**
     * Writes a 64 bit unsigned variable-length number.
     * @param {bigint} v
     */
    public writeUnsignedVarLong(v: bigint) {
        for (let i = 0; i < 10; ++i) {
            if (v >> 7n !== 0n) {
                this.writeByte(Number(v | 0x80n));
            } else {
                this.writeByte(Number(v & 0x7fn));
                break;
            }
            v >>= 7n;
        }
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
        if (!this.readBuffer) throw new Error('Buffer is write only!');
        return typeof this.readBuffer[this.readIndex] === 'undefined';
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
     * @returns {Buffer}
     * @deprecated See {@link getReadBuffer} and {@link getWriteBuffer}.
     */
    public getBuffer(): Buffer {
        return this.readBuffer !== null
            ? this.readBuffer
            : this.writeBuffer!.subarray(0, this.writeIndex);
    }

    /**
     * Returns the read buffer if available.
     * @returns {Buffer}
     */
    public getReadBuffer(): Buffer | null {
        return this.readBuffer;
    }

    /**
     * Returns the write buffer.
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
     */
    public clear(): void {
        this.readBuffer = null;
        this.readIndex = 0;
        this.writeIndex = 0;
    }

    /**
     * Conventional method to reuse the stream
     * without having to create a new BinaryStream instance.
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
        assert(this.readBuffer !== null, 'Cannot read without buffer data!');
        assert(
            this.readBuffer.byteLength >= byteLength,
            'Cannot read without buffer data!'
        );
    }

    /**
     * Do read assertions, check if the read buffer is null.
     * @param {number|bigint} num
     * @param {number|bigint} minVal
     * @param {number|bigint} maxVal
     */
    private doWriteAssertions(
        num: number | bigint,
        minVal: number | bigint,
        maxVal: number | bigint
    ): void {
        assert(
            num >= minVal && num <= maxVal,
            `Value out of bounds: value=${num}, min=${minVal}, max=${maxVal}`
        );
    }
}

// Default export for backward compatibility
export default BinaryStream;
