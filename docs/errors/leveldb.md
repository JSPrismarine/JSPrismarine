---
title: '@jsprismarine/leveldb errors'
description: The code, message and meaning of every error @jsprismarine/leveldb throws.
group: Documents
category: Errors
---

# @jsprismarine/leveldb errors

These are the errors `@jsprismarine/leveldb` throws. [The error reference](README.md) explains how to read an entry.

<!-- fact:errors.page.leveldb -->
## Groups

Catch one of these classes to handle every error that extends it.

| Class                     | What its errors mean                                                                                                                                                                                                                                           |
| ------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `CorruptionError`         | A database we could not fully parse. Always fatal: there is no repair path here, and guessing at a half-understood database is how a world gets silently mangled. Open it in the game, which has one, and let it rewrite the files.                            |
| `DatabaseLockedError`     | The database directory is held by someone else - another server, or the game itself. A lock left behind by a process that is no longer running is not this: it is taken over silently, so a server killed without a chance to clean up still starts next time. |
| `SnappyError`             | A Snappy-compressed block that does not decompress. Bedrock writes zlib, so a Snappy block comes from a tool other than the game, and a malformed one means that tool or the disk damaged it.                                                                  |
| `UnsupportedVersionError` | A world written before the chunk formats this package understands.                                                                                                                                                                                             |

## `LEVELDB_BLOCK_CACHE_SIZE_MUST_BE_NON_NEGATIVE`

`Block cache size must be a non-negative safe integer: {byteBudget}`

Thrown as `LeveldbErrors.BlockCacheSizeMustBeNonNegative`, which extends `RangeError`.

The database was opened with a block cache size that is negative or not a whole number.

## `LEVELDB_BLOCK_CHECKSUM_MISMATCH`

`Block checksum mismatch at offset {offset}: stored {expected}, computed {actual}`

Thrown as `LeveldbErrors.BlockChecksumMismatch`, which extends `CorruptionError`.

A table block's checksum does not match its contents, so the file was damaged on disk.
Restore the world from a backup, or open it in the game to let it repair what it can.

## `LEVELDB_BLOCK_RESTART_COUNT_TOO_LARGE`

`Block declares {restartCount} restart points it cannot hold`

Thrown as `LeveldbErrors.BlockRestartCountTooLarge`, which extends `CorruptionError`.

A table block claims more restart points than it has room for, so the table is damaged.

## `LEVELDB_BLOCK_TOO_SHORT`

`Block is too short to hold a restart count`

Thrown as `LeveldbErrors.BlockTooShort`, which extends `CorruptionError`.

A table block is shorter than its own trailer, so the table is damaged.

## `LEVELDB_CANNOT_ADD_TO_FINISHED_BLOCK`

`Cannot add to a finished block`

Thrown as `LeveldbErrors.CannotAddToFinishedBlock`, which extends `Error`.

The table writer added a key to a block it already finished. This is a bug in the table
writer.

## `LEVELDB_COMMIT_IN_PROGRESS`

`A commit is still appending; queue this write behind it with commit`

Thrown as `LeveldbErrors.CommitInProgress`, which extends `Error`.

A synchronous write was made while an asynchronous commit was still appending. Queue the
write with `commit` instead.

## `LEVELDB_CURRENT_IS_EMPTY`

`CURRENT is empty`

Thrown as `LeveldbErrors.CurrentIsEmpty`, which extends `CorruptionError`.

The world's `CURRENT` file is empty, so the database does not know which manifest is current.
It was cut short when the game or a server stopped; restore the world from a backup.

## `LEVELDB_CURRENT_NAMES_MISSING_MANIFEST`

`CURRENT names {current}, which does not exist`

Thrown as `LeveldbErrors.CurrentNamesMissingManifest`, which extends `CorruptionError`.

The world's `CURRENT` file names a manifest that is gone, so the files were deleted or copied
in part. Restore the world from a backup.

## `LEVELDB_DATABASE_ALREADY_EXISTS`

`A database already exists at {directory}`

Thrown as `LeveldbErrors.DatabaseAlreadyExists`, which extends `Error`.

The database was opened with `errorIfExists`, and a database is already there.

## `LEVELDB_DATABASE_IS_CLOSED`

`Database is closed`

Thrown as `LeveldbErrors.DatabaseIsClosed`, which extends `Error`.

Code used the database after closing it.

## `LEVELDB_DATABASE_IS_READ_ONLY`

`Database was opened read-only`

Thrown as `LeveldbErrors.DatabaseIsReadOnly`, which extends `Error`.

Code wrote to a database opened read-only.

## `LEVELDB_DATABASE_LOCKED`

`The world at {path} is already open. Close Minecraft, or the other server, before starting: two writers on one LevelDB do not race for a stale read, they delete each other's files and the world does not survive it.`

Thrown as `LeveldbErrors.DatabaseLocked`, which extends `DatabaseLockedError`.

Another process holds the world's lock, so the server refuses to open it. Close the game or
the other server that has the world open, then start again.

## `LEVELDB_DATABASE_LOCKED_BY_RUNNING_PROCESS`

`The world at {path} is already open (held by process {pid}, which is still running). Close Minecraft, or the other server, before starting: two writers on one LevelDB do not race for a stale read, they delete each other's files and the world does not survive it.`

Thrown as `LeveldbErrors.DatabaseLockedByRunningProcess`, which extends `DatabaseLockedError`.

Another process that is still running holds the world's lock. Close it, then start again; a
lock left by a process that has exited is taken over on its own.

## `LEVELDB_EMBEDDED_TABLE_WORKER_OUTSIDE_EXECUTABLE`

`The embedded LevelDB table worker requires a Node single executable`

Thrown as `LeveldbErrors.EmbeddedTableWorkerOutsideExecutable`, which extends `Error`.

The packaged server's bundled table worker was asked for while running from source. This is a
bug in how the worker is chosen.

## `LEVELDB_ENTRY_RUNS_PAST_BLOCK`

`Entry runs past its block or shares too many key bytes`

Thrown as `LeveldbErrors.EntryRunsPastBlock`, which extends `CorruptionError`.

A table entry's lengths run past its block, so the table is damaged.

## `LEVELDB_ENTRY_SHARES_TOO_MANY_KEY_BYTES`

`Entry shares {shared} bytes with a {byteLength} byte key`

Thrown as `LeveldbErrors.EntrySharesTooManyKeyBytes`, which extends `CorruptionError`.

A table entry claims to share more bytes with the previous key than that key has, so the
table is damaged.

## `LEVELDB_ENTRY_VARINT_RUNS_PAST_BLOCK`

`Entry varint runs past its block`

Thrown as `LeveldbErrors.EntryVarintRunsPastBlock`, which extends `CorruptionError`.

A length in a table entry runs past its block, so the table is damaged.

## `LEVELDB_ENTRY_VARINT_UNTERMINATED`

`Entry varint does not terminate within 5 bytes`

Thrown as `LeveldbErrors.EntryVarintUnterminated`, which extends `CorruptionError`.

A length in a table entry is malformed, so the table is damaged.

## `LEVELDB_FILE_IS_NOT_REGULAR`

`{file} is not a regular file`

Thrown as `LeveldbErrors.FileIsNotRegular`, which extends `Error`.

A database file path names a directory or device rather than a file. Something else was put
in the world's `db` folder.

## `LEVELDB_FILE_IS_SYMBOLIC_LINK`

`{file} is a symbolic link`

Thrown as `LeveldbErrors.FileIsSymbolicLink`, which extends `Error`.

A database file is a symbolic link, which the database refuses so a write cannot land outside
the world folder. Replace the link with the file.

## `LEVELDB_FILTER_BLOCK_OFFSETS_OUT_OF_ORDER`

`Filter block offsets must be nondecreasing: {blockOffset}`

Thrown as `LeveldbErrors.FilterBlockOffsetsOutOfOrder`, which extends `RangeError`.

The table writer added filter data out of order. This is a bug in the table writer.

## `LEVELDB_FLUSH_REFUSED_AFTER_MANIFEST_FAILURE`

`The manifest could not record a change, so the database refuses to flush`

Thrown as `LeveldbErrors.FlushRefusedAfterManifestFailure`, which extends `Error`.

An earlier change could not be written to the manifest, so the database stops flushing rather
than reuse table numbers the manifest may hold. Free space and restart the server.

## `LEVELDB_FOOTER_HANDLES_TOO_LARGE`

`Block handles do not fit in the footer`

Thrown as `LeveldbErrors.FooterHandlesTooLarge`, which extends `RangeError`.

A table's index handles are too large for its footer. This is a bug in the table writer.

## `LEVELDB_FOOTER_WRONG_SIZE`

`Footer is {byteLength} bytes, expected {footerLength}`

Thrown as `LeveldbErrors.FooterWrongSize`, which extends `RangeError`.

A table footer has the wrong size. This is a bug in the table writer.

## `LEVELDB_INTERNAL_KEY_TOO_SHORT`

`Internal key is {byteLength} bytes, the trailer alone is 8`

Thrown as `LeveldbErrors.InternalKeyTooShort`, which extends `RangeError`.

A stored key is shorter than the trailer every key carries, so the record is damaged.

## `LEVELDB_INVALID_BLOOM_FILTER_BITS_PER_KEY`

`Bloom filter bits per key must be a positive safe integer: {bitsPerKey}`

Thrown as `LeveldbErrors.InvalidBloomFilterBitsPerKey`, which extends `RangeError`.

The database was opened with a bloom filter size that is not a positive whole number.

## `LEVELDB_LOG_APPEND_IN_PROGRESS`

`An append is still running on this log`

Thrown as `LeveldbErrors.LogAppendInProgress`, which extends `Error`.

A write was appended to a log file while another append to it was still running. This is a
bug in the database's write path.

## `LEVELDB_LOG_DAMAGED`

`Log is damaged: {reason} ({bytes} bytes)`

Thrown as `LeveldbErrors.LogDamaged`, which extends `CorruptionError`.

Part of a log file is unreadable, usually the tail of a write cut off by a crash. The reason
says what was wrong.

## `LEVELDB_LOG_FAILED`

`An earlier append to this log failed`

Thrown as `LeveldbErrors.LogFailed`, which extends `Error`.

An earlier write to this log failed, so it takes no more. The cause is that earlier error,
usually a full disk.

## `LEVELDB_MANIFEST_LEVEL_OUT_OF_RANGE`

`Manifest names level {level}`

Thrown as `LeveldbErrors.ManifestLevelOutOfRange`, which extends `CorruptionError`.

The manifest puts a table on a level that does not exist, so it is damaged.

## `LEVELDB_MANIFEST_NEVER_NAMES_COMPARATOR`

`Manifest never names a comparator`

Thrown as `LeveldbErrors.ManifestNeverNamesComparator`, which extends `CorruptionError`.

The manifest does not say how its keys are ordered, so it is damaged or was not written by
LevelDB.

## `LEVELDB_MANIFEST_RECORD_HAS_UNKNOWN_TAG`

`Manifest record has unknown tag {tag}`

Thrown as `LeveldbErrors.ManifestRecordHasUnknownTag`, which extends `CorruptionError`.

The manifest has a record type this package does not read, so it is damaged or comes from a
newer LevelDB.

## `LEVELDB_NO_DATABASE`

`No database at {directory}`

Thrown as `LeveldbErrors.NoDatabase`, which extends `Error`.

There is no database at the path, and it was opened without `createIfMissing`.

## `LEVELDB_NOT_LEVELDB_TABLE`

`Not a LevelDB table: the footer magic does not match`

Thrown as `LeveldbErrors.NotLeveldbTable`, which extends `Error`.

A file in the world's `db` folder that should be a table is not one, so it is damaged or was
replaced.

## `LEVELDB_OVERLAPPING_LEVEL_FILES`

`Level {level} files {number} and {iNumber} overlap`

Thrown as `LeveldbErrors.OverlappingLevelFiles`, which extends `CorruptionError`.

Two table files on one level hold overlapping keys, so the manifest is damaged. Restore the
world from a backup, or open it in the game.

## `LEVELDB_READ_OUTSIDE_TABLE`

`Read of {length} bytes at {offset} is outside the table`

Thrown as `LeveldbErrors.ReadOutsideTable`, which extends `CorruptionError`.

A table's index points past the end of the file, so the table is truncated or damaged.

## `LEVELDB_RECORD_TRUNCATED`

`Expected {bytes} more bytes, {remaining} left`

Thrown as `LeveldbErrors.RecordTruncated`, which extends `RangeError`.

A record is shorter than its own layout says, so the file is truncated or damaged.

## `LEVELDB_RESTART_KEY_IS_MALFORMED`

`Restart key is malformed`

Thrown as `LeveldbErrors.RestartKeyIsMalformed`, which extends `CorruptionError`.

A table block's first key is malformed, so the table is damaged.

## `LEVELDB_SEEK_OUT_OF_RANGE`

`Position {value} is outside the readable range`

Thrown as `LeveldbErrors.SeekOutOfRange`, which extends `RangeError`.

A reader seeked outside the record it reads. This is a bug in the reader.

## `LEVELDB_SHORT_READ`

`Read {read} of {length} bytes at offset {offset}`

Thrown as `LeveldbErrors.ShortRead`, which extends `Error`.

Reading a table returned fewer bytes than asked, so the file shrank while the database read
it, or the disk failed.

## `LEVELDB_SNAPPY_COMPRESSION_UNSUPPORTED`

`Snappy compression is not implemented; blocks are written as ZlibRaw`

Thrown as `LeveldbErrors.SnappyCompressionUnsupported`, which extends `Error`.

Code asked the database to write Snappy blocks, which it does not do. Bedrock writes zlib,
and so does this package.

## `LEVELDB_SNAPPY_COPY_OFFSET_OUT_OF_RANGE`

`Malformed snappy stream: copy offset {offset} points outside the output`

Thrown as `LeveldbErrors.SnappyCopyOffsetOutOfRange`, which extends `SnappyError`.

A Snappy block copies from before its own start, so it is damaged.

## `LEVELDB_SNAPPY_COPY_PAST_DECLARED_LENGTH`

`Malformed snappy stream: copy runs past the declared length`

Thrown as `LeveldbErrors.SnappyCopyPastDeclaredLength`, which extends `SnappyError`.

A Snappy block copies past the length its header declares, so it is damaged.

## `LEVELDB_SNAPPY_LENGTH_MISMATCH`

`Malformed snappy stream: produced {out} bytes, the header declared {expected}`

Thrown as `LeveldbErrors.SnappyLengthMismatch`, which extends `SnappyError`.

A Snappy block decompressed to a different size than its header declares, so it is damaged.

## `LEVELDB_SNAPPY_LENGTH_PREFIX_UNTERMINATED`

`Malformed snappy stream: length prefix did not terminate`

Thrown as `LeveldbErrors.SnappyLengthPrefixUnterminated`, which extends `SnappyError`.

A Snappy block's length header is malformed, so it is damaged.

## `LEVELDB_SNAPPY_LITERAL_PAST_DECLARED_LENGTH`

`Malformed snappy stream: literal runs past the declared length`

Thrown as `LeveldbErrors.SnappyLiteralPastDeclaredLength`, which extends `SnappyError`.

A Snappy block's literal run goes past the length its header declares, so it is damaged.

## `LEVELDB_SNAPPY_TRUNCATED_FOUR_BYTE_COPY`

`Malformed snappy stream: truncated 4 byte copy`

Thrown as `LeveldbErrors.SnappyTruncatedFourByteCopy`, which extends `SnappyError`.

A Snappy block ends inside a copy instruction, so it is truncated.

## `LEVELDB_SNAPPY_TRUNCATED_LENGTH_PREFIX`

`Malformed snappy stream: truncated length prefix`

Thrown as `LeveldbErrors.SnappyTruncatedLengthPrefix`, which extends `SnappyError`.

A Snappy block ends inside its length header, so it is truncated.

## `LEVELDB_SNAPPY_TRUNCATED_LITERAL`

`Malformed snappy stream: truncated literal`

Thrown as `LeveldbErrors.SnappyTruncatedLiteral`, which extends `SnappyError`.

A Snappy block ends inside a literal run, so it is truncated.

## `LEVELDB_SNAPPY_TRUNCATED_LITERAL_LENGTH`

`Malformed snappy stream: truncated literal length`

Thrown as `LeveldbErrors.SnappyTruncatedLiteralLength`, which extends `SnappyError`.

A Snappy block ends inside a literal's length, so it is truncated.

## `LEVELDB_SNAPPY_TRUNCATED_ONE_BYTE_COPY`

`Malformed snappy stream: truncated 1 byte copy`

Thrown as `LeveldbErrors.SnappyTruncatedOneByteCopy`, which extends `SnappyError`.

A Snappy block ends inside a copy instruction, so it is truncated.

## `LEVELDB_SNAPPY_TRUNCATED_TWO_BYTE_COPY`

`Malformed snappy stream: truncated 2 byte copy`

Thrown as `LeveldbErrors.SnappyTruncatedTwoByteCopy`, which extends `SnappyError`.

A Snappy block ends inside a copy instruction, so it is truncated.

## `LEVELDB_TABLE_SHORTER_THAN_FOOTER`

`Table is {sourceCount} bytes, shorter than its own footer`

Thrown as `LeveldbErrors.TableShorterThanFooter`, which extends `CorruptionError`.

A table file is shorter than a table's footer, so it was truncated, usually by a crash during
a write.

## `LEVELDB_TABLE_WORKER_ANSWERED_COMPACTION_WITH_FLUSH`

`Table worker returned a flush result for compaction`

Thrown as `LeveldbErrors.TableWorkerAnsweredCompactionWithFlush`, which extends `Error`.

The table worker answered a compaction with a flush result. This is a bug in the database.

## `LEVELDB_TABLE_WORKER_ANSWERED_FLUSH_WITH_COMPACTION`

`Table worker returned a compaction result for a flush`

Thrown as `LeveldbErrors.TableWorkerAnsweredFlushWithCompaction`, which extends `Error`.

The table worker answered a flush with a compaction result. This is a bug in the database.

## `LEVELDB_TABLE_WORKER_BUSY`

`The database already has a table worker request in flight`

Thrown as `LeveldbErrors.TableWorkerBusy`, which extends `Error`.

A second table build was sent to the worker before the first came back. This is a bug in the
database.

## `LEVELDB_TABLE_WORKER_EXITED`

`Table worker exited before replying with code {code}`

Thrown as `LeveldbErrors.TableWorkerExited`, which extends `Error`.

The worker thread that writes tables exited mid-task, often because it ran out of memory.

## `LEVELDB_TABLE_WORKER_FAILED`

`{message}`

Thrown as `LeveldbErrors.TableWorkerFailed`, which extends `Error`.

The worker that builds tables failed. The message is the worker's own.

## `LEVELDB_TABLE_WORKER_OUTSIDE_WORKER_THREAD`

`TableBuilderWorker must run in a worker thread`

Thrown as `LeveldbErrors.TableWorkerOutsideWorkerThread`, which extends `Error`.

The table worker module was run as a main thread. Only the database starts it.

## `LEVELDB_UNKNOWN_BLOCK_COMPRESSION_TYPE`

`Unknown block compression type {type}`

Thrown as `LeveldbErrors.UnknownBlockCompressionType`, which extends `Error`.

A table block uses a compression type this package does not know, so the table is damaged or
comes from another LevelDB fork.

## `LEVELDB_UNKNOWN_COMPARATOR`

`Database uses the {comparator} comparator, whose ordering is unknown here`

Thrown as `LeveldbErrors.UnknownComparator`, which extends `CorruptionError`.

The database was written with a key ordering other than the byte order Bedrock uses, so it is
not a Bedrock world.

## `LEVELDB_UNKNOWN_INTERNAL_KEY_TYPE`

`Internal key has value type {type}`

Thrown as `LeveldbErrors.UnknownInternalKeyType`, which extends `RangeError`.

A stored key carries an operation type that is neither a value nor a deletion, so the record
is damaged.

## `LEVELDB_UNKNOWN_WRITE_BATCH_OPERATION`

`Write batch operation has type {type}`

Thrown as `LeveldbErrors.UnknownWriteBatchOperation`, which extends `CorruptionError`.

A write batch in the log holds an operation that is neither a put nor a delete, so the log is
damaged.

## `LEVELDB_UNREADABLE_BLOCK_COMPRESSION`

`Block at offset {offset} has compression type {type}`

Thrown as `LeveldbErrors.UnreadableBlockCompression`, which extends `CorruptionError`.

A table block is compressed with a scheme this package does not read, so the table is damaged
or comes from a tool that writes another format.

## `LEVELDB_VARINT32_UNTERMINATED`

`Varint32 did not terminate within 5 bytes`

Thrown as `LeveldbErrors.Varint32Unterminated`, which extends `RangeError`.

A length in a database record is malformed, so the record is damaged.

## `LEVELDB_VARINT64_UNTERMINATED`

`Varint64 did not terminate within 10 bytes`

Thrown as `LeveldbErrors.Varint64Unterminated`, which extends `RangeError`.

A number in a database record is malformed, so the record is damaged.

## `LEVELDB_WRITE_BATCH_TOO_SHORT`

`Write batch is {byteLength} bytes, the header alone is 12`

Thrown as `LeveldbErrors.WriteBatchTooShort`, which extends `CorruptionError`.

A write batch in the log is shorter than its header, so the log is damaged.

## `LEVELDB_WRITES_REFUSED_AFTER_COMMIT_FAILURE`

`A commit failed to reach the log, so the database refuses further writes`

Thrown as `LeveldbErrors.WritesRefusedAfterCommitFailure`, which extends `Error`.

An earlier write could not be written to the log, so the database stops taking writes rather
than lose them. The cause is the earlier error, usually a full disk; free space and restart
the server.

## `LEVELDB_WRITES_REFUSED_AFTER_MANIFEST_FAILURE`

`The manifest could not record a change, so the database refuses further writes`

Thrown as `LeveldbErrors.WritesRefusedAfterManifestFailure`, which extends `Error`.

An earlier change could not be written to the manifest, so the database stops taking writes
rather than risk a world it cannot reopen. The cause is that earlier error, usually a full
disk; free space and restart the server.
<!-- /fact -->
