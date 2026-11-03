import { crc32cUpdate, mask } from '../util/Crc32c';
import { decompress, isCompressionType } from '../compression/Compression';
import { BlockReader } from './BlockReader';
import { BlockCache } from './BlockCache';
import { ByteReader } from '../util/ByteReader';
import { CorruptionError } from '../Errors';
import { FOOTER_LENGTH, decodeFooter, readBlockHandle } from './Footer';
import { BLOOM_FILTER2_META_KEY, FilterBlockReader } from './FilterBlock';
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

/** Shared cache identity for blocks read from one table file. */
export interface TableReaderOptions {
    /** The database file number used to namespace this table's block keys. */
    fileNumber?: number;
    /** A cache shared by all tables in one database. */
    blockCache?: BlockCache;
}

/** Whether a sequential table scan should populate the point-lookup block cache. */
export interface TableScanOptions {
    /** Populate the point-lookup cache while scanning; defaults to true. */
    useCache?: boolean;
}

/**
 * Reads a table file.
 *
 * Blocks are decompressed on demand and cached. Index and filter blocks stay pinned, while data
 * blocks share the database's bounded cache.
 */
export class TableReader {
    private readonly source: TableSource;
    private readonly compare: (a: Buffer, b: Buffer) => number;
    private readonly metaIndexHandle: BlockHandle;
    private readonly indexHandle: BlockHandle;
    private readonly fileNumber: number;
    private readonly blockCache: BlockCache;
    private filterHandle: BlockHandle | null | undefined;

    public constructor(
        source: TableSource,
        comparator: (a: Buffer, b: Buffer) => number,
        options: TableReaderOptions = {}
    ) {
        if (source.size < FOOTER_LENGTH) {
            throw new CorruptionError(`Table is ${source.size} bytes, shorter than its own footer`);
        }

        this.source = source;
        this.compare = comparator;
        this.fileNumber = options.fileNumber ?? 0;
        // Standalone readers retain their prior per-table, unbounded cache behavior. Database
        // readers pass one shared bounded cache and a unique file number.
        this.blockCache = options.blockCache ?? new BlockCache(Number.MAX_SAFE_INTEGER);
        const footer = decodeFooter(Buffer.from(source.read(source.size - FOOTER_LENGTH, FOOTER_LENGTH)));
        this.metaIndexHandle = footer.metaIndexHandle;
        this.indexHandle = footer.indexHandle;
    }

    private readBlock(handle: BlockHandle, useCache = true, pinned = false): BlockReader {
        if (useCache) {
            const cached = this.blockCache.get(this.fileNumber, handle.offset);
            if (cached !== null) return cached;
        }

        const contents = this.readBlockContents(handle);
        const block = new BlockReader(contents, this.compare);
        if (useCache) this.blockCache.set(this.fileNumber, handle.offset, block, contents.byteLength, pinned);
        return block;
    }

    private readBlockContents(handle: BlockHandle): Buffer {
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

        return decompress(type, payload);
    }

    private index(useCache: boolean): BlockReader {
        return this.readBlock(this.indexHandle, useCache, true);
    }

    private filterBlock(): FilterBlockReader | null {
        if (this.filterHandle === undefined) this.filterHandle = this.findFilterHandle();
        if (this.filterHandle === null) return null;

        const cached = this.blockCache.getFilter(this.fileNumber, this.filterHandle.offset);
        if (cached !== null) return cached;

        try {
            const contents = this.readBlockContents(this.filterHandle);
            const filter = new FilterBlockReader(contents);
            this.blockCache.setFilter(this.fileNumber, this.filterHandle.offset, filter, contents.byteLength, true);
            return filter;
        } catch {
            // Filters are optional metadata: a damaged filter must fall back to the data block.
            this.filterHandle = null;
            return null;
        }
    }

    private findFilterHandle(): BlockHandle | null {
        try {
            for (const entry of this.readBlock(this.metaIndexHandle, true, true).entries()) {
                if (entry.key.toString() === BLOOM_FILTER2_META_KEY) {
                    return readBlockHandle(new ByteReader(entry.value));
                }
            }
        } catch {
            // An unreadable metaindex cannot prove absence, so point lookups use the data block.
        }

        return null;
    }

    /** The value stored for exactly `key`, or null. Callers handle the deletion tombstone. */
    public get(key: Buffer): Buffer | null {
        const entry = this.lookup(key, key);

        return entry !== null && this.compare(entry.key, key) === 0 ? entry.value : null;
    }

    /**
     * The first entry at or after `key`, using `filterKey` only to check the candidate data block.
     *
     * Database internal keys seek before their stored versions, while the Bloom filter indexes
     * only the user key. Keeping those keys separate lets point reads use the filter safely.
     *
     * @param key - The key used to seek within the table.
     * @param filterKey - The user key encoded by the filter, defaulting to `key`.
     */
    public lookup(key: Buffer, filterKey: Buffer = key): BlockEntry | null {
        const index = this.index(true).seek(key);
        if (index === null) return null;

        const handle = readBlockHandle(new ByteReader(index.value));
        const filter = this.filterBlock();
        if (filter !== null && !filter.keyMayMatch(handle.offset, filterKey)) return null;

        return this.readBlock(handle).seek(key);
    }

    /**
     * The first entry at or after `key`, or null when every key in the table sorts before it.
     *
     * A point lookup, and the reason this is not `seekFrom(key)` taking one element: a generator
     * that has to be able to run to the end of the table cannot stop the index at one entry. This
     * reads one index block entry and one data block entry region instead of scanning both whole,
     * which is the difference between about 2 ms and about 5 us per lookup on a 2 MiB table.
     */
    public seek(key: Buffer): BlockEntry | null {
        // The index's key for a data block is a separator at or after that block's last key, so
        // the first index entry at or after the target names the block the target would be in. A
        // block that then yields nothing means the target sits in the gap the separator covers,
        // so the answer is the next block's first entry.
        for (const index of this.index(true).seekFrom(key)) {
            const found = this.readBlock(readBlockHandle(new ByteReader(index.value))).seek(key);
            if (found !== null) return found;
        }

        return null;
    }

    /** Every entry from the first one at or after `key`, in order, to the end of the table. */
    public *seekFrom(key: Buffer, options: TableScanOptions = {}): IterableIterator<BlockEntry> {
        let from: Buffer | null = key;

        const useCache = options.useCache ?? true;
        for (const index of this.index(useCache).seekFrom(key)) {
            const block = this.readBlock(readBlockHandle(new ByteReader(index.value)), useCache);
            yield* from === null ? block.entries() : block.seekFrom(from);
            from = null;
        }
    }

    public *entries(options: TableScanOptions = {}): IterableIterator<BlockEntry> {
        const useCache = options.useCache ?? true;
        for (const index of this.index(useCache).entries()) {
            yield* this.readBlock(readBlockHandle(new ByteReader(index.value)), useCache).entries();
        }
    }
}

export default TableReader;
