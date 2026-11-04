const CONTROL_BYTES = Int32Array.BYTES_PER_ELEMENT * 4;
const RECORD_LENGTH_BYTES = 4;

/**
 * A bounded single-producer/single-consumer byte queue shared between two threads.
 * The four atomic control slots hold the write cursor, read cursor, high-water mark, and full-write count.
 */
export default class SharedByteRing {
    private readonly shared: SharedArrayBuffer;
    private readonly control: Int32Array;
    private readonly bytes: Uint8Array;

    /**
     * Creates or attaches to a ring.
     * @param capacity - The byte capacity available for records and their four-byte lengths.
     * @param memory - The shared memory to attach to; omit it to allocate a new ring.
     * @throws When the capacity or shared memory size is invalid.
     */
    public constructor(capacity: number, memory?: SharedArrayBuffer) {
        if (!Number.isSafeInteger(capacity) || capacity < 8 || capacity >= 0x80000000) {
            throw new RangeError(`A shared byte ring needs a capacity from 8 to 2147483647 bytes; got ${capacity}`);
        }

        const shared = memory ?? new SharedArrayBuffer(CONTROL_BYTES + capacity);
        if (shared.byteLength !== CONTROL_BYTES + capacity) {
            throw new RangeError(
                `Shared byte ring memory has ${shared.byteLength} bytes; expected ${CONTROL_BYTES + capacity}`
            );
        }

        this.shared = shared;
        this.control = new Int32Array(shared, 0, CONTROL_BYTES / Int32Array.BYTES_PER_ELEMENT);
        this.bytes = new Uint8Array(shared, CONTROL_BYTES);
    }

    /** The shared memory handle to pass to the other thread. */
    public get memory(): SharedArrayBuffer {
        return this.shared;
    }

    /**
     * Adds one record by copying its parts into shared memory.
     * @param parts - The ordered byte slices making up the record.
     * @returns Whether the whole record fit; a full queue is never overwritten.
     */
    public tryWriteParts(parts: readonly Uint8Array[]): boolean {
        let length = 0;
        for (const part of parts) length += part.byteLength;

        const totalLength = RECORD_LENGTH_BYTES + length;
        if (totalLength > this.bytes.byteLength) {
            Atomics.add(this.control, 3, 1);
            return false;
        }

        const writeAt = Atomics.load(this.control, 0) >>> 0;
        const readAt = Atomics.load(this.control, 1) >>> 0;
        const used = (writeAt - readAt) >>> 0;
        if (used > this.bytes.byteLength || totalLength > this.bytes.byteLength - used) {
            Atomics.add(this.control, 3, 1);
            return false;
        }

        // Publish the end cursor only after every record byte is copied, so readers never observe a partial write.
        this.writeUInt32(writeAt, length);
        let offset = writeAt + RECORD_LENGTH_BYTES;
        for (const part of parts) {
            this.writeBytes(offset, part);
            offset += part.byteLength;
        }

        const nextWriteAt = (writeAt + totalLength) >>> 0;
        Atomics.store(this.control, 0, nextWriteAt | 0);
        if (used + totalLength > Atomics.load(this.control, 2)) {
            Atomics.store(this.control, 2, used + totalLength);
        }
        return true;
    }

    /** Reads and removes the oldest complete record, or returns `null` when empty. */
    public tryRead(): Buffer | null {
        const writeAt = Atomics.load(this.control, 0) >>> 0;
        const readAt = Atomics.load(this.control, 1) >>> 0;
        const available = (writeAt - readAt) >>> 0;
        if (available < RECORD_LENGTH_BYTES) return null;

        const length = this.readUInt32(readAt);
        if (length > this.bytes.byteLength - RECORD_LENGTH_BYTES) {
            throw new RangeError(`Shared byte ring contains an invalid ${length}-byte record`);
        }

        const totalLength = RECORD_LENGTH_BYTES + length;
        if (available < totalLength) return null;

        const record = Buffer.allocUnsafe(length);
        this.readBytes(readAt + RECORD_LENGTH_BYTES, record);
        Atomics.store(this.control, 1, (readAt + totalLength) | 0);
        return record;
    }

    /** Queue size and overflow counters shared with the other thread. */
    public getMetrics(): { capacity: number; queuedBytes: number; highWatermarkBytes: number; fullWrites: number } {
        const writeAt = Atomics.load(this.control, 0) >>> 0;
        const readAt = Atomics.load(this.control, 1) >>> 0;
        return {
            capacity: this.bytes.byteLength,
            queuedBytes: (writeAt - readAt) >>> 0,
            highWatermarkBytes: Atomics.load(this.control, 2),
            fullWrites: Atomics.load(this.control, 3)
        };
    }

    private writeUInt32(cursor: number, value: number): void {
        for (let byte = 0; byte < RECORD_LENGTH_BYTES; byte++) {
            this.bytes[(cursor + byte) % this.bytes.byteLength] = (value >>> (byte * 8)) & 0xff;
        }
    }

    private readUInt32(cursor: number): number {
        let value = 0;
        for (let byte = 0; byte < RECORD_LENGTH_BYTES; byte++) {
            value |= this.bytes[(cursor + byte) % this.bytes.byteLength]! << (byte * 8);
        }
        return value >>> 0;
    }

    private writeBytes(cursor: number, source: Uint8Array): void {
        const offset = cursor % this.bytes.byteLength;
        const firstLength = Math.min(source.byteLength, this.bytes.byteLength - offset);
        this.bytes.set(source.subarray(0, firstLength), offset);
        if (firstLength < source.byteLength) this.bytes.set(source.subarray(firstLength), 0);
    }

    private readBytes(cursor: number, destination: Uint8Array): void {
        const offset = cursor % this.bytes.byteLength;
        const firstLength = Math.min(destination.byteLength, this.bytes.byteLength - offset);
        destination.set(this.bytes.subarray(offset, offset + firstLength));
        if (firstLength < destination.byteLength) {
            destination.set(this.bytes.subarray(0, destination.byteLength - firstLength), firstLength);
        }
    }
}
