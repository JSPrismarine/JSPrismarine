import { ByteReader } from '../util/ByteReader';
import { ByteWriter } from '../util/ByteWriter';
import { ValueType } from './InternalKey';
import { LeveldbErrors } from '@jsprismarine/errors/leveldb';

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

    /**
     * Decodes as much of a batch as is well formed, as upstream LevelDB's log replay applies a
     * damaged batch: every operation before the damage, then nothing more.
     *
     * @param encoded - One log record.
     * @returns The sequence and count the header declares, the operations read, and what stopped
     *   the read when it stopped early. A record too short for the header has neither.
     */
    public static decodePrefix(encoded: Buffer): {
        sequence: bigint;
        count: number;
        batch: WriteBatch;
        damage: string | null;
    } | null {
        if (encoded.byteLength < 12) return null;

        const reader = new ByteReader(encoded);
        const sequence = reader.u64();
        const count = reader.u32();
        const batch = new WriteBatch();

        try {
            while (!reader.exhausted) {
                const type = reader.u8();
                if (type === ValueType.Value) {
                    const key = Buffer.from(reader.lengthPrefixed());
                    batch.put(key, Buffer.from(reader.lengthPrefixed()));
                } else if (type === ValueType.Deletion) {
                    batch.del(Buffer.from(reader.lengthPrefixed()));
                } else {
                    return { sequence, count, batch, damage: 'unknown WriteBatch tag' };
                }
            }
        } catch {
            return { sequence, count, batch, damage: 'bad WriteBatch Put or Delete' };
        }

        return { sequence, count, batch, damage: batch.count === count ? null : 'WriteBatch has wrong count' };
    }

    public static decode(encoded: Buffer): { sequence: bigint; batch: WriteBatch } {
        if (encoded.byteLength < 12) {
            throw new LeveldbErrors.WriteBatchTooShort({ byteLength: encoded.byteLength });
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
                    throw new LeveldbErrors.UnknownWriteBatchOperation({ type });
            }
        }

        return { sequence, batch };
    }
}

export default WriteBatch;
