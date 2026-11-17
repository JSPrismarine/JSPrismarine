import { defineErrors, JSPrismarineError } from '@jsprismarine/errors/JSPrismarineError';

/**
 * A database we could not fully parse. Always fatal: there is no repair path here, and guessing
 * at a half-understood database is how a world gets silently mangled. Open it in the game, which
 * has one, and let it rewrite the files.
 */
export abstract class CorruptionError extends JSPrismarineError {
    public override name = 'CorruptionError';
}

/** A world written before the chunk formats this package understands. */
export abstract class UnsupportedVersionError extends JSPrismarineError {
    public override name = 'UnsupportedVersionError';
}

/**
 * A Snappy-compressed block that does not decompress. Bedrock writes zlib, so a Snappy block comes
 * from a tool other than the game, and a malformed one means that tool or the disk damaged it.
 */
export abstract class SnappyError extends JSPrismarineError {
    public override name = 'SnappyError';
}

/**
 * The database directory is held by someone else - another server, or the game itself.
 *
 * A lock left behind by a process that is no longer running is not this: it is taken over
 * silently, so a server killed without a chance to clean up still starts next time.
 */
export abstract class DatabaseLockedError extends JSPrismarineError {
    public override name = 'DatabaseLockedError';
}

/** The errors `@jsprismarine/leveldb` throws. */
export const LeveldbErrors = defineErrors('leveldb', {
    /**
     * A write was appended to a log file while another append to it was still running. This is a
     * bug in the database's write path.
     */
    LogAppendInProgress: 'An append is still running on this log',
    /**
     * A table block is compressed with a scheme this package does not read, so the table is damaged
     * or comes from a tool that writes another format.
     */
    UnreadableBlockCompression: {
        message: 'Block at offset {offset} has compression type {type}',
        base: CorruptionError
    },
    /** The database was opened with a block cache size that is negative or not a whole number. */
    BlockCacheSizeMustBeNonNegative: {
        message: 'Block cache size must be a non-negative safe integer: {byteBudget}',
        base: RangeError
    },
    /**
     * A table block's checksum does not match its contents, so the file was damaged on disk.
     * Restore the world from a backup, or open it in the game to let it repair what it can.
     */
    BlockChecksumMismatch: {
        message: 'Block checksum mismatch at offset {offset}: stored {expected}, computed {actual}',
        base: CorruptionError
    },
    /** A table block claims more restart points than it has room for, so the table is damaged. */
    BlockRestartCountTooLarge: {
        message: 'Block declares {restartCount} restart points it cannot hold',
        base: CorruptionError
    },
    /** A table's index handles are too large for its footer. This is a bug in the table writer. */
    FooterHandlesTooLarge: { message: 'Block handles do not fit in the footer', base: RangeError },
    /** A table block is shorter than its own trailer, so the table is damaged. */
    BlockTooShort: { message: 'Block is too short to hold a restart count', base: CorruptionError },
    /** The database was opened with a bloom filter size that is not a positive whole number. */
    InvalidBloomFilterBitsPerKey: {
        message: 'Bloom filter bits per key must be a positive safe integer: {bitsPerKey}',
        base: RangeError
    },
    /**
     * The table writer added a key to a block it already finished. This is a bug in the table
     * writer.
     */
    CannotAddToFinishedBlock: 'Cannot add to a finished block',
    /**
     * An earlier write could not be written to the log, so the database stops taking writes rather
     * than lose them. The cause is the earlier error, usually a full disk; free space and restart
     * the server.
     */
    WritesRefusedAfterCommitFailure: 'A commit failed to reach the log, so the database refuses further writes',
    /**
     * A synchronous write was made while an asynchronous commit was still appending. Queue the
     * write with `commit` instead.
     */
    CommitInProgress: 'A commit is still appending; queue this write behind it with commit',
    /**
     * The world's `CURRENT` file is empty, so the database does not know which manifest is current.
     * It was cut short when the game or a server stopped; restore the world from a backup.
     */
    CurrentIsEmpty: { message: 'CURRENT is empty', base: CorruptionError },
    /**
     * The world's `CURRENT` file names a manifest that is gone, so the files were deleted or copied
     * in part. Restore the world from a backup.
     */
    CurrentNamesMissingManifest: { message: 'CURRENT names {current}, which does not exist', base: CorruptionError },
    /** The database was opened with `errorIfExists`, and a database is already there. */
    DatabaseAlreadyExists: 'A database already exists at {directory}',
    /**
     * A second table build was sent to the worker before the first came back. This is a bug in the
     * database.
     */
    TableWorkerBusy: 'The database already has a table worker request in flight',
    /** Code used the database after closing it. */
    DatabaseIsClosed: 'Database is closed',
    /**
     * The database was written with a key ordering other than the byte order Bedrock uses, so it is
     * not a Bedrock world.
     */
    UnknownComparator: {
        message: 'Database uses the {comparator} comparator, whose ordering is unknown here',
        base: CorruptionError
    },
    /** Code wrote to a database opened read-only. */
    DatabaseIsReadOnly: 'Database was opened read-only',
    /**
     * An earlier write to this log failed, so it takes no more. The cause is that earlier error,
     * usually a full disk.
     */
    LogFailed: 'An earlier append to this log failed',
    /**
     * The packaged server's bundled table worker was asked for while running from source. This is a
     * bug in how the worker is chosen.
     */
    EmbeddedTableWorkerOutsideExecutable: 'The embedded LevelDB table worker requires a Node single executable',
    /** A table entry's lengths run past its block, so the table is damaged. */
    EntryRunsPastBlock: {
        message: 'Entry runs past its block or shares too many key bytes',
        base: CorruptionError
    },
    /**
     * A table entry claims to share more bytes with the previous key than that key has, so the
     * table is damaged.
     */
    EntrySharesTooManyKeyBytes: {
        message: 'Entry shares {shared} bytes with a {byteLength} byte key',
        base: CorruptionError
    },
    /** A length in a table entry is malformed, so the table is damaged. */
    EntryVarintUnterminated: {
        message: 'Entry varint does not terminate within 5 bytes',
        base: CorruptionError
    },
    /** A length in a table entry runs past its block, so the table is damaged. */
    EntryVarintRunsPastBlock: { message: 'Entry varint runs past its block', base: CorruptionError },
    /** A record is shorter than its own layout says, so the file is truncated or damaged. */
    RecordTruncated: { message: 'Expected {bytes} more bytes, {remaining} left', base: RangeError },
    /** The table writer added filter data out of order. This is a bug in the table writer. */
    FilterBlockOffsetsOutOfOrder: {
        message: 'Filter block offsets must be nondecreasing: {blockOffset}',
        base: RangeError
    },
    /** A table footer has the wrong size. This is a bug in the table writer. */
    FooterWrongSize: { message: 'Footer is {byteLength} bytes, expected {footerLength}', base: RangeError },
    /**
     * A stored key carries an operation type that is neither a value nor a deletion, so the record
     * is damaged.
     */
    UnknownInternalKeyType: { message: 'Internal key has value type {type}', base: RangeError },
    /** A stored key is shorter than the trailer every key carries, so the record is damaged. */
    InternalKeyTooShort: {
        message: 'Internal key is {byteLength} bytes, the trailer alone is 8',
        base: RangeError
    },
    /**
     * A database file path names a directory or device rather than a file. Something else was put
     * in the world's `db` folder.
     */
    FileIsNotRegular: '{file} is not a regular file',
    /**
     * A database file is a symbolic link, which the database refuses so a write cannot land outside
     * the world folder. Replace the link with the file.
     */
    FileIsSymbolicLink: '{file} is a symbolic link',
    /**
     * Two table files on one level hold overlapping keys, so the manifest is damaged. Restore the
     * world from a backup, or open it in the game.
     */
    OverlappingLevelFiles: { message: 'Level {level} files {number} and {iNumber} overlap', base: CorruptionError },
    /**
     * Part of a log file is unreadable, usually the tail of a write cut off by a crash. The reason
     * says what was wrong.
     */
    LogDamaged: { message: 'Log is damaged: {reason} ({bytes} bytes)', base: CorruptionError },
    /** A Snappy block copies from before its own start, so it is damaged. */
    SnappyCopyOffsetOutOfRange: {
        message: 'Malformed snappy stream: copy offset {offset} points outside the output',
        base: SnappyError
    },
    /** A Snappy block copies past the length its header declares, so it is damaged. */
    SnappyCopyPastDeclaredLength: {
        message: 'Malformed snappy stream: copy runs past the declared length',
        base: SnappyError
    },
    /** A Snappy block's length header is malformed, so it is damaged. */
    SnappyLengthPrefixUnterminated: {
        message: 'Malformed snappy stream: length prefix did not terminate',
        base: SnappyError
    },
    /** A Snappy block's literal run goes past the length its header declares, so it is damaged. */
    SnappyLiteralPastDeclaredLength: {
        message: 'Malformed snappy stream: literal runs past the declared length',
        base: SnappyError
    },
    /**
     * A Snappy block decompressed to a different size than its header declares, so it is damaged.
     */
    SnappyLengthMismatch: {
        message: 'Malformed snappy stream: produced {out} bytes, the header declared {expected}',
        base: SnappyError
    },
    /** A Snappy block ends inside a copy instruction, so it is truncated. */
    SnappyTruncatedOneByteCopy: {
        message: 'Malformed snappy stream: truncated 1 byte copy',
        base: SnappyError
    },
    /** A Snappy block ends inside a copy instruction, so it is truncated. */
    SnappyTruncatedTwoByteCopy: {
        message: 'Malformed snappy stream: truncated 2 byte copy',
        base: SnappyError
    },
    /** A Snappy block ends inside a copy instruction, so it is truncated. */
    SnappyTruncatedFourByteCopy: {
        message: 'Malformed snappy stream: truncated 4 byte copy',
        base: SnappyError
    },
    /** A Snappy block ends inside its length header, so it is truncated. */
    SnappyTruncatedLengthPrefix: {
        message: 'Malformed snappy stream: truncated length prefix',
        base: SnappyError
    },
    /** A Snappy block ends inside a literal run, so it is truncated. */
    SnappyTruncatedLiteral: { message: 'Malformed snappy stream: truncated literal', base: SnappyError },
    /** A Snappy block ends inside a literal's length, so it is truncated. */
    SnappyTruncatedLiteralLength: {
        message: 'Malformed snappy stream: truncated literal length',
        base: SnappyError
    },
    /**
     * An earlier change could not be written to the manifest, so the database stops taking writes
     * rather than risk a world it cannot reopen. The cause is that earlier error, usually a full
     * disk; free space and restart the server.
     */
    WritesRefusedAfterManifestFailure: 'The manifest could not record a change, so the database refuses further writes',
    /**
     * An earlier change could not be written to the manifest, so the database stops flushing rather
     * than reuse table numbers the manifest may hold. Free space and restart the server.
     */
    FlushRefusedAfterManifestFailure: 'The manifest could not record a change, so the database refuses to flush',
    /** The manifest puts a table on a level that does not exist, so it is damaged. */
    ManifestLevelOutOfRange: { message: 'Manifest names level {level}', base: CorruptionError },
    /**
     * The manifest does not say how its keys are ordered, so it is damaged or was not written by
     * LevelDB.
     */
    ManifestNeverNamesComparator: { message: 'Manifest never names a comparator', base: CorruptionError },
    /**
     * The manifest has a record type this package does not read, so it is damaged or comes from a
     * newer LevelDB.
     */
    ManifestRecordHasUnknownTag: { message: 'Manifest record has unknown tag {tag}', base: CorruptionError },
    /** There is no database at the path, and it was opened without `createIfMissing`. */
    NoDatabase: 'No database at {directory}',
    /**
     * A file in the world's `db` folder that should be a table is not one, so it is damaged or was
     * replaced.
     */
    NotLeveldbTable: 'Not a LevelDB table: the footer magic does not match',
    /** A reader seeked outside the record it reads. This is a bug in the reader. */
    SeekOutOfRange: { message: 'Position {value} is outside the readable range', base: RangeError },
    /** A table's index points past the end of the file, so the table is truncated or damaged. */
    ReadOutsideTable: {
        message: 'Read of {length} bytes at {offset} is outside the table',
        base: CorruptionError
    },
    /**
     * Reading a table returned fewer bytes than asked, so the file shrank while the database read
     * it, or the disk failed.
     */
    ShortRead: 'Read {read} of {length} bytes at offset {offset}',
    /** A table block's first key is malformed, so the table is damaged. */
    RestartKeyIsMalformed: { message: 'Restart key is malformed', base: CorruptionError },
    /**
     * Code asked the database to write Snappy blocks, which it does not do. Bedrock writes zlib,
     * and so does this package.
     */
    SnappyCompressionUnsupported: 'Snappy compression is not implemented; blocks are written as ZlibRaw',
    /**
     * A table file is shorter than a table's footer, so it was truncated, usually by a crash during
     * a write.
     */
    TableShorterThanFooter: {
        message: 'Table is {sourceCount} bytes, shorter than its own footer',
        base: CorruptionError
    },
    /** The worker thread that writes tables exited mid-task, often because it ran out of memory. */
    TableWorkerExited: 'Table worker exited before replying with code {code}',
    /**
     * The table worker answered a flush with a compaction result. This is a bug in the database.
     */
    TableWorkerAnsweredFlushWithCompaction: 'Table worker returned a compaction result for a flush',
    /**
     * The table worker answered a compaction with a flush result. This is a bug in the database.
     */
    TableWorkerAnsweredCompactionWithFlush: 'Table worker returned a flush result for compaction',
    /** The table worker module was run as a main thread. Only the database starts it. */
    TableWorkerOutsideWorkerThread: 'TableBuilderWorker must run in a worker thread',
    /**
     * A table block uses a compression type this package does not know, so the table is damaged or
     * comes from another LevelDB fork.
     */
    UnknownBlockCompressionType: 'Unknown block compression type {type}',
    /** A length in a database record is malformed, so the record is damaged. */
    Varint32Unterminated: { message: 'Varint32 did not terminate within 5 bytes', base: RangeError },
    /** A number in a database record is malformed, so the record is damaged. */
    Varint64Unterminated: { message: 'Varint64 did not terminate within 10 bytes', base: RangeError },
    /** A write batch in the log is shorter than its header, so the log is damaged. */
    WriteBatchTooShort: {
        message: 'Write batch is {byteLength} bytes, the header alone is 12',
        base: CorruptionError
    },
    /**
     * A write batch in the log holds an operation that is neither a put nor a delete, so the log is
     * damaged.
     */
    UnknownWriteBatchOperation: { message: 'Write batch operation has type {type}', base: CorruptionError },
    /** The worker that builds tables failed. The message is the worker's own. */
    TableWorkerFailed: '{message}',
    /**
     * Another process holds the world's lock, so the server refuses to open it. Close the game or
     * the other server that has the world open, then start again.
     */
    DatabaseLocked: {
        message:
            "The world at {path} is already open. Close Minecraft, or the other server, before starting: two writers on one LevelDB do not race for a stale read, they delete each other's files and the world does not survive it.",
        base: DatabaseLockedError
    },
    /**
     * Another process that is still running holds the world's lock. Close it, then start again; a
     * lock left by a process that has exited is taken over on its own.
     */
    DatabaseLockedByRunningProcess: {
        message:
            "The world at {path} is already open (held by process {pid}, which is still running). Close Minecraft, or the other server, before starting: two writers on one LevelDB do not race for a stale read, they delete each other's files and the world does not survive it.",
        base: DatabaseLockedError
    }
});
