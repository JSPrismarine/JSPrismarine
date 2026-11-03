import type { CompressionType } from '../compression/Compression';

/** The table settings copied to a background table-building task. */
export interface WorkerTableOptions {
    /** Target size of each data block. */
    blockSize: number;
    /** Number of entries between full keys in each block. */
    blockRestartInterval: number;
    /** Compression codec written to table blocks. */
    compression: CompressionType;
    /** Compression level passed to the codec. */
    compressionLevel: number;
}

/** One internal key and value supplied to a table-building worker. */
export interface WorkerTableEntry {
    internalKey: Uint8Array;
    value: Uint8Array;
}

/** Table metadata exchanged between the database thread and its table worker. */
export interface WorkerTableMetadata {
    number: number;
    size: number;
    smallest: Uint8Array;
    largest: Uint8Array;
}

/** Builds one flushed memtable into a LevelDB table file. */
export interface BuildTableTask {
    kind: 'build';
    filePath: string;
    fileNumber: number;
    entries: WorkerTableEntry[];
    smallest: Uint8Array;
    largest: Uint8Array;
    options: WorkerTableOptions;
}

/** Merges selected adjacent-level tables and writes bounded output files. */
export interface CompactTablesTask {
    kind: 'compact';
    directory: string;
    inputs: WorkerTableMetadata[];
    deeperRanges: Array<{ smallest: Uint8Array; largest: Uint8Array }>;
    outputLevel: number;
    firstOutputNumber: number;
    maxFileSize: number;
    options: WorkerTableOptions;
}

/** A request handled by the database's background table worker. */
export type TableWorkerTask = BuildTableTask | CompactTablesTask;

/** One output from a table build or multi-file compaction. */
export type TableWorkerResult =
    | { kind: 'built'; file: WorkerTableMetadata }
    | { kind: 'compacted'; outputs: Array<[number, WorkerTableMetadata]>; nextFileNumber: number };

/** The worker's successful result or failure message. */
export type TableWorkerReply = { result: TableWorkerResult } | { error: string };
