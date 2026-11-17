import { crc32cUpdate, mask, unmask } from '../util/Crc32c';
import { ByteWriter } from '../util/ByteWriter';
import { LeveldbErrors } from '@jsprismarine/errors/leveldb';

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

/** A stretch of a log a reader skipped because it was damaged. */
export interface LogCorruption {
    /** How many bytes of the log, or of a record being reassembled, were dropped. */
    bytes: number;
    /** What was wrong, in upstream LevelDB's words. */
    reason: string;
}

/**
 * Reassembles records, following upstream LevelDB's `log::Reader` case for case.
 *
 * A tail cut short, which is what a crash during an append leaves, ends the iteration quietly
 * either way. What differs is damage before the tail. Without `onCorruption` it throws, which is
 * right for the manifest: upstream refuses to open a database whose manifest is damaged. With
 * it, the damage is reported and skipped the way upstream skips it while replaying a log: a bad
 * checksum or an impossible length drops the rest of its 32 KiB block, a fragment out of
 * sequence is dropped on its own, and reading carries on. That is how Bedrock opens such a world,
 * losing only the writes in the damaged stretch.
 *
 * @param data - The whole log file.
 * @param onCorruption - Told about each skipped stretch. Absent, the first one throws.
 * @throws {CorruptionError} When `onCorruption` is absent and the log is damaged before its tail.
 */
export function* readLogRecords(
    data: Buffer,
    onCorruption?: (corruption: LogCorruption) => void
): IterableIterator<Buffer> {
    const report =
        onCorruption ??
        ((corruption: LogCorruption): void => {
            throw new LeveldbErrors.LogDamaged({ reason: corruption.reason, bytes: corruption.bytes });
        });

    let pending: Buffer[] = [];
    let pendingBytes = 0;
    let fragmented = false;

    const dropPending = (reason: string): void => {
        if (fragmented && pendingBytes > 0) report({ bytes: pendingBytes, reason });
        pending = [];
        pendingBytes = 0;
        fragmented = false;
    };

    for (let blockStart = 0; blockStart < data.byteLength; blockStart += LOG_BLOCK_SIZE) {
        const blockEnd = Math.min(blockStart + LOG_BLOCK_SIZE, data.byteLength);
        // Upstream knows it reached the end when a read returns less than a whole block.
        const lastBlock = blockEnd - blockStart < LOG_BLOCK_SIZE;
        let offset = blockStart;

        // A block tail shorter than a header is padding; at the end of the file, a cut header.
        while (blockEnd - offset >= LOG_HEADER_SIZE) {
            const storedCrc = data.readUInt32LE(offset);
            const length = data.readUInt16LE(offset + 4);
            const type = data.readUInt8(offset + 6);
            const payloadStart = offset + LOG_HEADER_SIZE;

            if (payloadStart + length > blockEnd) {
                // In the last block this is a record whose append never finished.
                if (lastBlock) return;
                report({ bytes: blockEnd - offset, reason: 'bad record length' });
                dropPending('error in middle of record');
                break;
            }

            // Zeroes where a header should be: space preallocated and never written. Upstream
            // skips the rest of the block without calling it corruption.
            if (type === LogRecordType.Zero && length === 0) {
                dropPending('error in middle of record');
                break;
            }

            const payload = data.subarray(payloadStart, payloadStart + length);
            if (crc32cUpdate(payload, crc32cUpdate(Buffer.from([type]))) !== unmask(storedCrc)) {
                report({ bytes: blockEnd - offset, reason: 'checksum mismatch' });
                dropPending('error in middle of record');
                break;
            }

            offset = payloadStart + length;

            switch (type) {
                case LogRecordType.Full:
                    if (fragmented) dropPending('partial record without end(1)');
                    yield payload;
                    break;
                case LogRecordType.First:
                    if (fragmented) dropPending('partial record without end(2)');
                    pending = [payload];
                    pendingBytes = payload.byteLength;
                    fragmented = true;
                    break;
                case LogRecordType.Middle:
                    if (!fragmented) {
                        report({ bytes: payload.byteLength, reason: 'missing start of fragmented record(1)' });
                        break;
                    }
                    pending.push(payload);
                    pendingBytes += payload.byteLength;
                    break;
                case LogRecordType.Last:
                    if (!fragmented) {
                        report({ bytes: payload.byteLength, reason: 'missing start of fragmented record(2)' });
                        break;
                    }
                    pending.push(payload);
                    yield Buffer.concat(pending);
                    pending = [];
                    pendingBytes = 0;
                    fragmented = false;
                    break;
                default:
                    report({ bytes: payload.byteLength + pendingBytes, reason: `unknown record type ${type}` });
                    pending = [];
                    pendingBytes = 0;
                    fragmented = false;
            }
        }
    }

    // A record whose fragments ran out at the end of the file is an interrupted write.
}
