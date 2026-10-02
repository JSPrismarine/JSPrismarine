import { CompressionType, compress } from '../compression/Compression';
import { crc32cUpdate, mask } from '../util/Crc32c';
import { findShortSuccessor, findShortestSeparator } from '../util/Comparator';
import { BlockBuilder } from './BlockBuilder';
import { ByteWriter } from '../util/ByteWriter';
import { encodeFooter, writeBlockHandle } from './Footer';
import type { BlockHandle } from './Footer';

export interface TableBuilderOptions {
    blockSize?: number;
    blockRestartInterval?: number;
    compression?: CompressionType;
    compressionLevel?: number;
    /**
     * How index separators are shortened. The defaults treat keys as opaque bytes; a table of
     * internal keys must pass the internal-key aware pair, or the separators it produces are not
     * valid internal keys and every point lookup compares them against a garbage trailer.
     */
    shortestSeparator?: (start: Buffer, limit: Buffer) => Buffer;
    shortSuccessor?: (key: Buffer) => Buffer;
}

/**
 * Writes a table file: data blocks, then an index over them, then the footer.
 *
 * No filter block. A bloom filter is an optimisation LevelDB looks for in the metaindex and does
 * without when it is absent - the same path it takes for databases written before filters existed
 * - so omitting one costs a few wasted block reads and nothing else. Tables the game wrote keep
 * their filters; we simply never consult them.
 */
export class TableBuilder {
    private readonly blockSize: number;
    private readonly compression: CompressionType;
    private readonly compressionLevel: number | undefined;
    private readonly shortestSeparator: (start: Buffer, limit: Buffer) => Buffer;
    private readonly shortSuccessor: (key: Buffer) => Buffer;

    private readonly output = new ByteWriter(64 * 1024);
    private readonly dataBlock: BlockBuilder;
    private readonly indexBlock: BlockBuilder;

    private lastKey: Buffer = Buffer.alloc(0);
    private entryCount = 0;

    /**
     * The index entry for a finished data block is only written once the *next* key is known, so
     * that the separator between them can be shortened. Until then it waits here.
     */
    private pendingHandle: BlockHandle | null = null;

    public constructor(options: TableBuilderOptions = {}) {
        this.blockSize = options.blockSize ?? 4096;
        this.compression = options.compression ?? CompressionType.ZlibRaw;
        this.compressionLevel = options.compressionLevel;
        this.shortestSeparator = options.shortestSeparator ?? findShortestSeparator;
        this.shortSuccessor = options.shortSuccessor ?? findShortSuccessor;
        this.dataBlock = new BlockBuilder(options.blockRestartInterval ?? 16);
        // Index entries are one per data block and rarely share prefixes worth eliding.
        this.indexBlock = new BlockBuilder(1);
    }

    public get count(): number {
        return this.entryCount;
    }

    public get size(): number {
        return this.output.length + this.dataBlock.estimatedSize;
    }

    public add(key: Buffer, value: Buffer): void {
        if (this.pendingHandle !== null) {
            this.writeIndexEntry(this.shortestSeparator(this.lastKey, key));
        }

        this.dataBlock.add(key, value);
        this.lastKey = Buffer.from(key);
        this.entryCount++;

        if (this.dataBlock.estimatedSize >= this.blockSize) {
            this.pendingHandle = this.writeBlock(this.dataBlock.finish());
            this.dataBlock.reset();
        }
    }

    private writeIndexEntry(separator: Buffer): void {
        const handle = new ByteWriter(16);
        writeBlockHandle(handle, this.pendingHandle!);
        this.indexBlock.add(separator, handle.finish());
        this.pendingHandle = null;
    }

    /**
     * Appends one block plus its trailer and reports where it landed. The trailer is the
     * compression byte and a masked CRC-32C taken over the block *and* that byte - a checksum
     * over the payload alone would not notice the compression type being corrupted.
     */
    private writeBlock(contents: Buffer): BlockHandle {
        const { type, data } = compress(this.compression, contents, this.compressionLevel);
        const offset = this.output.length;

        this.output.bytes(data);
        this.output.u8(type);
        this.output.u32(mask(crc32cUpdate(Buffer.from([type]), crc32cUpdate(data))));

        // The handle's size covers the block only; the 5 byte trailer is implied.
        return { offset, size: data.byteLength };
    }

    public finish(): Buffer {
        if (!this.dataBlock.empty) {
            this.pendingHandle = this.writeBlock(this.dataBlock.finish());
        }

        if (this.pendingHandle !== null) {
            this.writeIndexEntry(this.shortSuccessor(this.lastKey));
        }

        // Empty, but present: LevelDB reads the metaindex before deciding there is no filter.
        const metaIndexHandle = this.writeBlock(new BlockBuilder(1).finish());
        const indexHandle = this.writeBlock(this.indexBlock.finish());

        this.output.bytes(encodeFooter({ metaIndexHandle, indexHandle }));
        return this.output.finish();
    }
}

export default TableBuilder;
