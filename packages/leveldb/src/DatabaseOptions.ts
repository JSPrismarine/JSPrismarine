import zlib from 'node:zlib';

import { CompressionType } from './compression/Compression';

export interface DatabaseOptions {
    /** Create the directory and an empty database when there is nothing there. Default true. */
    createIfMissing?: boolean;
    /** Fail if a database already exists. Default false. */
    errorIfExists?: boolean;
    /** Never write, and take no lock, so a world open in the game can still be inspected. */
    readOnly?: boolean;
    /** How much may accumulate in memory before it is flushed to a table. */
    writeBufferSize?: number;
    /** Maximum bytes of decompressed data blocks retained for point lookups. */
    blockCacheSize?: number;
    /** The size a compaction's output files are cut at. */
    maxFileSize?: number;
    blockSize?: number;
    blockRestartInterval?: number;
    /** What blocks are written with. Defaults to what the game itself writes. */
    compression?: CompressionType;
    compressionLevel?: number;
    /** How many level 0 files may pile up before they are merged into level 1. */
    l0CompactionTrigger?: number;
    /**
     * fsync after every batch. Slow, and unnecessary given the log is replayed on open. A write or
     * commit can ask for its own with {@link WriteOptions.sync}.
     */
    sync?: boolean;
}

/** How one {@link Database.write} or {@link Database.commit} reaches the disk. */
export interface WriteOptions {
    /**
     * fsync the log once this batch is in it, so an operating system crash or a power loss keeps
     * it. Without it a process crash still keeps it, since the bytes are in the page cache. Defaults
     * to the database's {@link DatabaseOptions.sync}.
     */
    sync?: boolean;
}

export interface ResolvedOptions extends Required<DatabaseOptions> {}

export const resolveOptions = (options: DatabaseOptions = {}): ResolvedOptions => ({
    createIfMissing: options.createIfMissing ?? true,
    errorIfExists: options.errorIfExists ?? false,
    readOnly: options.readOnly ?? false,
    writeBufferSize: options.writeBufferSize ?? 4 * 1024 * 1024,
    blockCacheSize: options.blockCacheSize ?? 64 * 1024 * 1024,
    maxFileSize: options.maxFileSize ?? 2 * 1024 * 1024,
    blockSize: options.blockSize ?? 4096,
    blockRestartInterval: options.blockRestartInterval ?? 16,
    compression: options.compression ?? CompressionType.ZlibRaw,
    compressionLevel: options.compressionLevel ?? zlib.constants.Z_DEFAULT_COMPRESSION,
    l0CompactionTrigger: options.l0CompactionTrigger ?? 4,
    sync: options.sync ?? false
});
