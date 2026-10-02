import { crc32cUpdate, mask, unmask } from '../util/Crc32c';
import { ByteWriter } from '../util/ByteWriter';
import { CorruptionError } from '../Errors';

/**
 * The record log, used for both the write-ahead log and the manifest.
 *
 * The file is a run of 32 KiB blocks. Each record has a 7 byte header - masked CRC-32C, then a
 * 16 bit length, then a type - and a record that will not fit in what is left of a block is split
 * across the boundary with the fragment types. A block tail too short for even a header is padded
 * with zeroes, which is what makes the whole thing recoverable after a crash: a reader that hits
 * a partial record at the end simply stops.
 */

export const LOG_BLOCK_SIZE = 32768;
export const LOG_HEADER_SIZE = 7;

export enum LogRecordType {
    Zero = 0,
    Full = 1,
    First = 2,
    Middle = 3,
    Last = 4
}

/** Frames records into blocks. Emits the whole file; callers append the result. */
export class LogWriter {
    private readonly writer = new ByteWriter(LOG_BLOCK_SIZE);
    private blockOffset: number;

    /** `startOffset` is the length of the file being appended to, so blocks stay aligned. */
    public constructor(startOffset = 0) {
        this.blockOffset = startOffset % LOG_BLOCK_SIZE;
    }

    public append(record: Buffer): void {
        let at = 0;
        let first = true;

        do {
            const available = LOG_BLOCK_SIZE - this.blockOffset;
            if (available < LOG_HEADER_SIZE) {
                // Not even a header fits: pad the tail so the next record starts a fresh block.
                if (available > 0) this.writer.bytes(Buffer.alloc(available));
                this.blockOffset = 0;
            }

            const capacity = LOG_BLOCK_SIZE - this.blockOffset - LOG_HEADER_SIZE;
            const length = Math.min(record.byteLength - at, capacity);
            const last = at + length === record.byteLength;

            this.emit(
                first
                    ? last
                        ? LogRecordType.Full
                        : LogRecordType.First
                    : last
                      ? LogRecordType.Last
                      : LogRecordType.Middle,
                record.subarray(at, at + length)
            );

            at += length;
            first = false;
            // A zero-length record still needs one fragment, hence the do/while.
        } while (at < record.byteLength);
    }

    private emit(type: LogRecordType, payload: Buffer): void {
        this.writer
            .u32(mask(crc32cUpdate(payload, crc32cUpdate(Buffer.from([type])))))
            .u16(payload.byteLength)
            .u8(type)
            .bytes(payload);

        this.blockOffset += LOG_HEADER_SIZE + payload.byteLength;
    }

    public finish(): Buffer {
        return this.writer.finish();
    }

    public get length(): number {
        return this.writer.length;
    }
}

/**
 * Reassembles records. A truncated tail - the normal state of a log after a crash - ends the
 * iteration rather than throwing; a bad checksum in the middle of the file does throw, because
 * that is real corruption rather than an interrupted write.
 */
export function* readLogRecords(data: Buffer): IterableIterator<Buffer> {
    let offset = 0;
    let pending: Buffer[] = [];

    while (offset + LOG_HEADER_SIZE <= data.byteLength) {
        const blockRemaining = LOG_BLOCK_SIZE - (offset % LOG_BLOCK_SIZE);
        if (blockRemaining < LOG_HEADER_SIZE) {
            offset += blockRemaining;
            continue;
        }

        const storedCrc = data.readUInt32LE(offset);
        const length = data.readUInt16LE(offset + 4);
        const type = data.readUInt8(offset + 6);

        if (type === LogRecordType.Zero && length === 0 && storedCrc === 0) {
            // Zero padding at a block tail.
            offset += blockRemaining;
            continue;
        }

        const payloadStart = offset + LOG_HEADER_SIZE;
        if (payloadStart + length > data.byteLength) return;

        const payload = data.subarray(payloadStart, payloadStart + length);
        const computed = crc32cUpdate(payload, crc32cUpdate(Buffer.from([type])));
        if (computed !== unmask(storedCrc)) {
            throw new CorruptionError(`Log record checksum mismatch at offset ${offset}`);
        }

        offset = payloadStart + length;

        switch (type) {
            case LogRecordType.Full:
                if (pending.length > 0) throw new CorruptionError('Full log record interrupted a fragmented one');
                yield payload;
                break;
            case LogRecordType.First:
                if (pending.length > 0) throw new CorruptionError('Log record started before the previous one ended');
                pending = [payload];
                break;
            case LogRecordType.Middle:
                if (pending.length === 0) throw new CorruptionError('Log fragment with no record to continue');
                pending.push(payload);
                break;
            case LogRecordType.Last:
                if (pending.length === 0) throw new CorruptionError('Log fragment ended a record that never started');
                pending.push(payload);
                yield Buffer.concat(pending);
                pending = [];
                break;
            default:
                throw new CorruptionError(`Log record has unknown type ${type}`);
        }
    }

    // A record whose fragments ran out mid-file is an interrupted write. Stop, do not throw.
}
