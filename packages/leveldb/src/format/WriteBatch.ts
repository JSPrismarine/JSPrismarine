import { ByteReader } from '../util/ByteReader';
import { ByteWriter } from '../util/ByteWriter';
import { CorruptionError } from '../Errors';
import { ValueType } from './InternalKey';

export interface BatchOperation {
    type: ValueType;
    key: Buffer;
    /** Absent for a deletion. */
    value?: Buffer;
}

/**
 * A set of writes applied together.
 *
 * On disk a batch is the unit the write-ahead log stores: an 8 byte sequence number, a 4 byte
 * count, then the operations. The sequence belongs to the first operation and the rest follow it,
 * which is why the batch is also the unit sequence numbers are handed out in.
 */
export class WriteBatch {
    private readonly operations: BatchOperation[] = [];
    private bytes = 0;

    public put(key: Buffer, value: Buffer): this {
        this.operations.push({ type: ValueType.Value, key, value });
        this.bytes += key.byteLength + value.byteLength + 12;
        return this;
    }

    public del(key: Buffer): this {
        this.operations.push({ type: ValueType.Deletion, key });
        this.bytes += key.byteLength + 8;
        return this;
    }

    public get count(): number {
        return this.operations.length;
    }

    public get approximateSize(): number {
        return this.bytes;
    }

    public entries(): readonly BatchOperation[] {
        return this.operations;
    }

    public clear(): void {
        this.operations.length = 0;
        this.bytes = 0;
    }

    public encode(sequence: bigint): Buffer {
        const writer = new ByteWriter(this.bytes + 12);
        writer.u64(sequence).u32(this.operations.length);

        for (const operation of this.operations) {
            writer.u8(operation.type).lengthPrefixed(operation.key);
            if (operation.type === ValueType.Value) writer.lengthPrefixed(operation.value!);
        }

        return writer.finish();
    }

    public static decode(encoded: Buffer): { sequence: bigint; batch: WriteBatch } {
        if (encoded.byteLength < 12) {
            throw new CorruptionError(`Write batch is ${encoded.byteLength} bytes, the header alone is 12`);
        }

        const reader = new ByteReader(encoded);
        const sequence = reader.u64();
        const count = reader.u32();
        const batch = new WriteBatch();

        for (let i = 0; i < count; i++) {
            const type = reader.u8();
            switch (type) {
                case ValueType.Value: {
                    const key = reader.lengthPrefixed();
                    batch.put(Buffer.from(key), Buffer.from(reader.lengthPrefixed()));
                    break;
                }

                case ValueType.Deletion:
                    batch.del(Buffer.from(reader.lengthPrefixed()));
                    break;

                default:
                    throw new CorruptionError(`Write batch operation has type ${type}`);
            }
        }

        return { sequence, batch };
    }
}

export default WriteBatch;
