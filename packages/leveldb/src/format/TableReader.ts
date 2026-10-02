import { crc32cUpdate, mask } from '../util/Crc32c';
import { decompress, isCompressionType } from '../compression/Compression';
import { BlockReader } from './BlockReader';
import { ByteReader } from '../util/ByteReader';
import { CorruptionError } from '../Errors';
import { FOOTER_LENGTH, decodeFooter, readBlockHandle } from './Footer';
import type { BlockEntry } from './BlockReader';
import type { BlockHandle } from './Footer';

/** How a table's bytes are fetched. A file-backed table reads 4 KiB at a time off a cached fd. */
export interface TableSource {
    read(offset: number, length: number): Buffer;
    readonly size: number;
}

export const bufferSource = (buffer: Buffer): TableSource => ({
    read: (offset, length) => {
        if (offset < 0 || offset + length > buffer.byteLength) {
            throw new CorruptionError(`Read of ${length} bytes at ${offset} is outside the table`);
        }

        return buffer.subarray(offset, offset + length);
    },
    size: buffer.byteLength
});

const BLOCK_TRAILER_LENGTH = 5;

/**
 * Reads a table file.
 *
 * Blocks are decompressed on demand and cached, because the index block is consulted on every
 * lookup and a data block is usually consulted several times in a row while a chunk's records are
 * read. The cache is per-table and unbounded, which is fine for the access pattern here: a table
 * is at most a couple of megabytes and is dropped whole when the version stops referencing it.
 */
export class TableReader {
    private readonly source: TableSource;
    private readonly compare: (a: Buffer, b: Buffer) => number;
    private readonly indexHandle: BlockHandle;
    private readonly blocks = new Map<number, BlockReader>();
    private indexBlock: BlockReader | null = null;

    public constructor(source: TableSource, comparator: (a: Buffer, b: Buffer) => number) {
        if (source.size < FOOTER_LENGTH) {
            throw new CorruptionError(`Table is ${source.size} bytes, shorter than its own footer`);
        }

        this.source = source;
        this.compare = comparator;
        this.indexHandle = decodeFooter(
            Buffer.from(source.read(source.size - FOOTER_LENGTH, FOOTER_LENGTH))
        ).indexHandle;
    }

    private readBlock(handle: BlockHandle): BlockReader {
        const cached = this.blocks.get(handle.offset);
        if (cached) return cached;

        const raw = this.source.read(handle.offset, handle.size + BLOCK_TRAILER_LENGTH);
        const payload = raw.subarray(0, handle.size);
        const type = raw.readUInt8(handle.size);
        const expected = raw.readUInt32LE(handle.size + 1);

        const actual = mask(crc32cUpdate(Buffer.from([type]), crc32cUpdate(payload)));
        if (actual !== expected) {
            throw new CorruptionError(
                `Block checksum mismatch at offset ${handle.offset}: stored ${expected}, computed ${actual}`
            );
        }

        if (!isCompressionType(type)) {
            throw new CorruptionError(`Block at offset ${handle.offset} has compression type ${type}`);
        }

        const block = new BlockReader(decompress(type, payload), this.compare);
        this.blocks.set(handle.offset, block);
        return block;
    }

    private index(): BlockReader {
        this.indexBlock ??= this.readBlock(this.indexHandle);
        return this.indexBlock;
    }

    /** The value stored for exactly `key`, or null. Callers handle the deletion tombstone. */
    public get(key: Buffer): Buffer | null {
        for (const entry of this.seekFrom(key)) {
            return this.compare(entry.key, key) === 0 ? entry.value : null;
        }

        return null;
    }

    /** Every entry from the first one at or after `key`, in order, to the end of the table. */
    public *seekFrom(key: Buffer): IterableIterator<BlockEntry> {
        // The index's key for a data block is a separator at or after that block's last key, so
        // the first index entry at or after the target names the block the target would be in.
        // Blocks after it are read whole.
        const first = this.index().seek(key);
        if (first === null) return;

        let reached = false;
        for (const index of this.index().entries()) {
            if (!reached && this.compare(index.key, first.key) !== 0) continue;

            const isFirstBlock = !reached;
            reached = true;

            for (const entry of this.readBlock(readBlockHandle(new ByteReader(index.value))).entries()) {
                if (isFirstBlock && this.compare(entry.key, key) < 0) continue;

                yield entry;
            }
        }
    }

    public *entries(): IterableIterator<BlockEntry> {
        for (const index of this.index().entries()) {
            yield* this.readBlock(readBlockHandle(new ByteReader(index.value))).entries();
        }
    }
}

export default TableReader;
