import type { BlockReader } from './BlockReader';

/** Current and cumulative point-lookup cache usage. */
export interface BlockCacheStats {
    /** Number of cached blocks returned to a point lookup. */
    hits: number;
    /** Number of blocks a point lookup had to read and decompress. */
    misses: number;
    /** Bytes held by evictable data blocks. */
    dataBytes: number;
    /** Bytes held by pinned index blocks, which are excluded from the data budget. */
    pinnedBytes: number;
    /** Total decompressed bytes resident in the cache. */
    residentBytes: number;
    /** Point lookup hits divided by total cache lookups. */
    hitRate: number;
}

interface CachedBlock {
    fileNumber: number;
    offset: number;
    reader: BlockReader;
    bytes: number;
    pinned: boolean;
}

/**
 * A shared LRU for decompressed table blocks.
 *
 * Index blocks stay pinned because every lookup consults them. Data blocks share a byte budget
 * across every open table, so reading the world cannot retain every chunk's decompressed bytes.
 */
export class BlockCache {
    private readonly blocks = new Map<string, CachedBlock>();
    private dataBytes = 0;
    private pinnedBytes = 0;
    private hits = 0;
    private misses = 0;

    public constructor(private readonly byteBudget: number) {
        if (!Number.isSafeInteger(byteBudget) || byteBudget < 0) {
            throw new RangeError(`Block cache size must be a non-negative safe integer: ${byteBudget}`);
        }
    }

    private key(fileNumber: number, offset: number): string {
        return `${fileNumber}:${offset}`;
    }

    /** Returns a cached block and marks it most recently used. */
    public get(fileNumber: number, offset: number): BlockReader | null {
        const key = this.key(fileNumber, offset);
        const cached = this.blocks.get(key);
        if (cached === undefined) {
            this.misses++;
            return null;
        }

        this.blocks.delete(key);
        this.blocks.set(key, cached);
        this.hits++;
        return cached.reader;
    }

    /** Adds a decompressed block, evicting least-recently used data blocks as needed. */
    public set(fileNumber: number, offset: number, reader: BlockReader, bytes: number, pinned = false): void {
        const key = this.key(fileNumber, offset);
        const existing = this.blocks.get(key);
        if (existing !== undefined) this.remove(key, existing);

        // A pinned index is intentionally allowed beyond the data budget; it is small and avoids
        // one disk read and decompression on every point lookup of its table.
        if (!pinned && (bytes > this.byteBudget || this.byteBudget === 0)) return;

        const cached: CachedBlock = { fileNumber, offset, reader, bytes, pinned };
        this.blocks.set(key, cached);
        if (pinned) this.pinnedBytes += bytes;
        else this.dataBytes += bytes;

        this.evict();
    }

    /** Drops all cached blocks belonging to a table that left the current version. */
    public deleteFile(fileNumber: number): void {
        for (const [key, cached] of this.blocks) {
            if (cached.fileNumber === fileNumber) this.remove(key, cached);
        }
    }

    /** A snapshot of cache residency and point-lookup hit rate. */
    public get stats(): BlockCacheStats {
        const lookups = this.hits + this.misses;
        return {
            hits: this.hits,
            misses: this.misses,
            dataBytes: this.dataBytes,
            pinnedBytes: this.pinnedBytes,
            residentBytes: this.dataBytes + this.pinnedBytes,
            hitRate: lookups === 0 ? 0 : this.hits / lookups
        };
    }

    private evict(): void {
        if (this.dataBytes <= this.byteBudget) return;

        for (const [key, cached] of this.blocks) {
            if (cached.pinned) continue;
            this.remove(key, cached);
            if (this.dataBytes <= this.byteBudget) return;
        }
    }

    private remove(key: string, cached: CachedBlock): void {
        this.blocks.delete(key);
        if (cached.pinned) this.pinnedBytes -= cached.bytes;
        else this.dataBytes -= cached.bytes;
    }
}
