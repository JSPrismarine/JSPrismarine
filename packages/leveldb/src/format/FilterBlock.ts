import { bloomFilter2MayContain, createBloomFilter2 } from './BloomFilter';
import { ByteWriter } from '../util/ByteWriter';

const FILTER_BASE_LOG2 = 11;
const FILTER_BASE_BYTES = 1 << FILTER_BASE_LOG2;

/** Metaindex key for the filter policy supported by Bedrock and JSPrismarine tables. */
export const BLOOM_FILTER2_META_KEY = 'filter.leveldb.BuiltinBloomFilter2';

/** Builds the LevelDB filter-block layout around BuiltinBloomFilter2 filters. */
export class FilterBlockBuilder {
    private readonly output = new ByteWriter(1024);
    private readonly filterOffsets: number[] = [];
    private readonly keys: Buffer[] = [];

    /**
     * Starts collecting keys for the filter segment containing a data block offset.
     *
     * @param blockOffset - The data block's byte offset in the table.
     */
    public startBlock(blockOffset: number): void {
        const filterIndex = Math.floor(blockOffset / FILTER_BASE_BYTES);
        if (!Number.isSafeInteger(filterIndex) || filterIndex < this.filterOffsets.length) {
            throw new RangeError(`Filter block offsets must be nondecreasing: ${blockOffset}`);
        }

        while (filterIndex > this.filterOffsets.length) this.generateFilter();
    }

    /**
     * Adds the key stored in a table data block to its current filter segment.
     *
     * @param key - The user key represented in the data block.
     */
    public addKey(key: Buffer): void {
        this.keys.push(Buffer.from(key));
    }

    /** Finishes the filter bytes, offset array, array start, and base-log parameter. */
    public finish(): Buffer {
        if (this.keys.length > 0) this.generateFilter();

        const offsetsStart = this.output.length;
        for (const offset of this.filterOffsets) this.output.u32(offset);
        this.output.u32(offsetsStart).u8(FILTER_BASE_LOG2);
        return this.output.finish();
    }

    private generateFilter(): void {
        this.filterOffsets.push(this.output.length);
        if (this.keys.length === 0) return;

        this.output.bytes(createBloomFilter2(this.keys));
        this.keys.length = 0;
    }
}

/** Reads filter segments indexed by 2 KiB table-file ranges. */
export class FilterBlockReader {
    private readonly valid: boolean;
    private readonly offsetsStart: number;
    private readonly filterCount: number;
    private readonly baseLog2: number;

    /** Reads filter offsets and disables filtering if their layout is invalid. */
    public constructor(private readonly data: Buffer) {
        if (data.byteLength < 5) {
            this.valid = false;
            this.offsetsStart = 0;
            this.filterCount = 0;
            this.baseLog2 = 0;
            return;
        }

        const baseLog2 = data.readUInt8(data.byteLength - 1);
        const offsetsStart = data.readUInt32LE(data.byteLength - 5);
        const offsetsBytes = data.byteLength - 5 - offsetsStart;
        const valid =
            baseLog2 < 32 && offsetsStart <= data.byteLength - 5 && offsetsBytes >= 0 && offsetsBytes % 4 === 0;

        this.valid = valid;
        this.offsetsStart = valid ? offsetsStart : 0;
        this.filterCount = valid ? offsetsBytes / 4 : 0;
        this.baseLog2 = valid ? baseLog2 : 0;
    }

    /**
     * Returns false only when a valid filter proves the key absent from the data block.
     *
     * @param blockOffset - The data block's byte offset in its table.
     * @param key - The user key to check.
     */
    public keyMayMatch(blockOffset: number, key: Buffer): boolean {
        if (!this.valid || !Number.isSafeInteger(blockOffset) || blockOffset < 0) return true;

        const filterIndex = Math.floor(blockOffset / 2 ** this.baseLog2);
        if (filterIndex >= this.filterCount) return true;

        const start = this.data.readUInt32LE(this.offsetsStart + filterIndex * 4);
        const limit = this.data.readUInt32LE(this.offsetsStart + (filterIndex + 1) * 4);
        if (start === limit) return false;
        if (start > limit || limit > this.offsetsStart) return true;

        return bloomFilter2MayContain(key, this.data.subarray(start, limit));
    }
}
