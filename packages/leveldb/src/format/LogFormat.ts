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

/** Where a fragment sits in its record: the whole record, or its first, middle or last part. */
export const LogRecordType = {
    Zero: 0,
    Full: 1,
    First: 2,
    Middle: 3,
    Last: 4
} as const;

/** One of the values of {@link LogRecordType}. */
export type LogRecordType = (typeof LogRecordType)[keyof typeof LogRecordType];

/** One framed log record: the buffers to append, in order, and their total length. */
export interface FramedLogRecord {
    /**
     * Fragment headers, block padding and the record's payload. Each payload part is a view of
     * the record, so framing copies none of its bytes.
     */
    readonly parts: Buffer[];
    /** The bytes the parts add to the log. */
    readonly length: number;
}

/**
 * Frames one record for a log whose current length is `startOffset`.
 *
 * The parts are what a vectored write appends. A record bigger than a block is split into `First`,
 * `Middle` and `Last` fragments, and a block tail too short for a header is padded with zeroes.
 */
export const frameLogRecord = (record: Buffer, startOffset: number): FramedLogRecord => {
    const parts: Buffer[] = [];
    let blockOffset = startOffset % LOG_BLOCK_SIZE;
    let length = 0;
    let at = 0;
    let first = true;

    do {
        const available = LOG_BLOCK_SIZE - blockOffset;
        if (available < LOG_HEADER_SIZE) {
            // Not even a header fits: pad the tail so the next record starts a fresh block.
            if (available > 0) {
                parts.push(Buffer.alloc(available));
                length += available;
            }
            blockOffset = 0;
        }

        const capacity = LOG_BLOCK_SIZE - blockOffset - LOG_HEADER_SIZE;
        const size = Math.min(record.byteLength - at, capacity);
        const last = at + size === record.byteLength;
        const type = first
            ? last
                ? LogRecordType.Full
                : LogRecordType.First
            : last
              ? LogRecordType.Last
              : LogRecordType.Middle;
        const payload = record.subarray(at, at + size);

        const header = Buffer.allocUnsafe(LOG_HEADER_SIZE);
        header.writeUInt32LE(mask(crc32cUpdate(payload, crc32cUpdate(Buffer.from([type])))), 0);
        header.writeUInt16LE(payload.byteLength, 4);
        header.writeUInt8(type, 6);
        parts.push(header);
        if (payload.byteLength > 0) parts.push(payload);

        blockOffset += LOG_HEADER_SIZE + payload.byteLength;
        length += LOG_HEADER_SIZE + payload.byteLength;
        at += size;
        first = false;
        // A zero-length record still needs one fragment, hence the do/while.
    } while (at < record.byteLength);

    return { parts, length };
};

/** Frames records into blocks. Emits the whole file; callers append the result. */
export class LogWriter {
    private readonly writer = new ByteWriter(LOG_BLOCK_SIZE);
    private offset: number;

    /** `startOffset` is the length of the file being appended to, so blocks stay aligned. */
    public constructor(startOffset = 0) {
        this.offset = startOffset;
    }

    public append(record: Buffer): void {
        const framed = frameLogRecord(record, this.offset);
        for (const part of framed.parts) this.writer.bytes(part);
        this.offset += framed.length;
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
