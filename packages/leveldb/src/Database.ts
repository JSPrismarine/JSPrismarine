import fs from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { Worker } from 'node:worker_threads';

import {
    AppendFile,
    openTableFile,
    removeTableFile,
    replaceFileAtomically,
    syncDirectory,
    writeFileSynced
} from './db/Storage';
import type { TableFile } from './db/Storage';
import { BYTEWISE_COMPARATOR, compareBytewise } from './util/Comparator';
import {
    CURRENT_FILE_NAME,
    FileKind,
    logFileName,
    manifestFileName,
    parseFileName,
    tableFileName
} from './util/FileNames';
import { DirectoryLock } from './db/DirectoryLock';
import { LogWriter, frameLogRecord, readLogRecords } from './format/LogFormat';
import type { LogCorruption } from './format/LogFormat';
import { MemTable } from './db/MemTable';
import { MAX_LEVELS, VersionSet } from './db/VersionSet';
import { TableReader } from './format/TableReader';
import { BlockCache } from './format/BlockCache';
import {
    MAX_SEQUENCE,
    ValueType,
    compareInternalKeys,
    extractUserKey,
    lookupKey,
    parseInternalKey
} from './format/InternalKey';
import { WriteBatch } from './format/WriteBatch';
import { mergeSorted } from './util/mergeSorted';
import { decodeVersionEdit, encodeVersionEdit } from './db/VersionEdit';
import { resolveOptions } from './DatabaseOptions';
import type { DatabaseOptions, ResolvedOptions, WriteOptions } from './DatabaseOptions';
import type { FileMetaData, VersionEdit } from './db/VersionEdit';
import type { BlockCacheStats } from './format/BlockCache';
import type {
    TableWorkerReply,
    TableWorkerResult,
    TableWorkerTask,
    WorkerTableMetadata,
    WorkerTableOptions
} from './db/TableWorkerProtocol';
import { LeveldbErrors } from '@jsprismarine/errors/leveldb';
import { asError } from '@jsprismarine/errors/common';

/** The worker asset name defined by `scripts/package-sea.mts` for Node SEA builds. */
declare const JSP_SEA_TABLE_BUILDER_WORKER: string | undefined;
/**
 * Where a compiled Bun executable embedded the table builder, defined by
 * `.github/scripts/build-aot.mjs`. The bundled module's own URL is the binary's root, not
 * this file's directory, so the worker beside it is not there.
 */
declare const JSP_EMBEDDED_TABLE_BUILDER_WORKER: string | undefined;

export interface DatabaseStats {
    /** Number of unmerged level 0 files. */
    level0Files: number;
    /** Number of live table files at all levels. */
    totalFiles: number;
    /** Bytes currently held by the mutable and immutable tables. */
    memtableBytes: number;
    /** Highest sequence number ever written to this database. */
    lastSequence: bigint;
    /** Cumulative WAL, table, manifest, and CURRENT bytes written by this instance. */
    bytesWritten: number;
    /** Shared point-lookup cache usage and hit rate. */
    blockCache: BlockCacheStats;
}

/**
 * How long the manifest may grow before the next edit starts a fresh one holding a snapshot.
 * Upstream LevelDB stops reusing a manifest at the same size.
 */
export const MANIFEST_ROLL_BYTES = 2 * 1024 * 1024;

export interface KeyRange {
    gte?: Buffer;
    lt?: Buffer;
}

/**
 * A LevelDB database, able to read and write the ones Minecraft: Bedrock Edition keeps its worlds
 * in.
 *
 * The manifest works as upstream's does. Opening for writing starts a fresh `MANIFEST-<n>` that
 * holds a snapshot of the current version and repoints `CURRENT` at it. Every flush and compaction
 * then appends one edit to that manifest and syncs it once. Once the manifest passes
 * `MANIFEST_ROLL_BYTES` the next edit starts a fresh one, so reopening never replays an
 * unbounded history.
 */
export class Database {
    private readonly directory: string;
    private readonly options: ResolvedOptions;
    private versions = new VersionSet();
    private readonly tables = new Map<number, { reader: TableReader; file: TableFile }>();
    private readonly blockCache: BlockCache;

    private lock: DirectoryLock | null = null;
    private memtable = new MemTable();
    private immutableMemtable: MemTable | null = null;
    private log: AppendFile | null = null;
    /** The manifest edits are appended to, or null until the next edit writes a fresh one. */
    private manifest: AppendFile | null = null;
    /**
     * Why the manifest could not be rolled back after a failed edit. The manifest may then name
     * tables that were never installed, so they are kept, and every later write is refused.
     */
    private manifestFailure: Error | null = null;
    /**
     * Why a commit's log append failed. The memtable holds that batch and the log does not, so
     * nothing written after it could be trusted to replay, and every later write is refused.
     */
    private commitFailure: Error | null = null;
    private tableWorker: Worker | null = null;
    private tableWorkerRequest: {
        resolve: (result: TableWorkerResult) => void;
        reject: (error: Error) => void;
    } | null = null;
    private flushPromise: Promise<void> | null = null;
    private flushRequested = false;
    private backgroundFlushError: Error | null = null;
    private bytesWritten = 0;
    private closed = false;
    /** Scans still running, which keep the tables they may read on disk and open. */
    private activeScans = 0;
    /** Tables a compaction replaced while a scan was running, deleted once none is. */
    private readonly retiredTables: number[] = [];

    private constructor(directory: string, options: ResolvedOptions) {
        this.directory = directory;
        this.options = options;
        this.blockCache = new BlockCache(options.blockCacheSize);
    }

    public static async open(directory: string, options: DatabaseOptions = {}): Promise<Database> {
        const resolved = resolveOptions(options);
        const database = new Database(directory, resolved);
        await database.recover();
        return database;
    }

    // ---------------------------------------------------------------- lifecycle

    private async recover(): Promise<void> {
        const exists = fs.existsSync(path.join(this.directory, CURRENT_FILE_NAME));

        if (exists && this.options.errorIfExists) {
            throw new LeveldbErrors.DatabaseAlreadyExists({ directory: this.directory });
        }

        if (!exists && !this.options.createIfMissing && !this.options.readOnly) {
            throw new LeveldbErrors.NoDatabase({ directory: this.directory });
        }

        if (!this.options.readOnly) {
            fs.mkdirSync(this.directory, { recursive: true });
            this.lock = DirectoryLock.acquire(this.directory);
        }

        if (exists) {
            this.readManifest();
            this.replayLogs();
        }

        if (this.options.readOnly) return;

        // Anything replayed out of the logs becomes a table before the manifest is rewritten, so
        // the fresh manifest describes a database with nothing outstanding.
        if (!this.memtable.empty) await this.flushMemTable();

        this.versions.previousLogNumber = 0;
        this.versions.logNumber = this.versions.allocateFileNumber();
        this.writeManifest();
        this.openLog();

        // Everything the old logs held is in a table by now, and the fresh manifest names only
        // the new one. Without this an open leaks a log file, and a world a developer restarts
        // all day ends up with hundreds of empty ones to read past.
        this.discardStaleLogs(this.versions.logNumber);
        this.discardOrphanTables();
    }

    private readManifest(): void {
        const current = fs.readFileSync(path.join(this.directory, CURRENT_FILE_NAME), 'utf8').trim();
        if (current.length === 0) throw new LeveldbErrors.CurrentIsEmpty();

        const manifest = path.join(this.directory, current);
        if (!fs.existsSync(manifest)) throw new LeveldbErrors.CurrentNamesMissingManifest({ current });

        let sawComparator = false;
        for (const record of readLogRecords(fs.readFileSync(manifest))) {
            const edit = decodeVersionEdit(record);

            if (edit.comparator !== undefined) {
                if (edit.comparator !== BYTEWISE_COMPARATOR) {
                    throw new LeveldbErrors.UnknownComparator({
                        comparator: edit.comparator
                    });
                }

                sawComparator = true;
            }

            this.versions.applyEdit(edit);
        }

        if (!sawComparator) throw new LeveldbErrors.ManifestNeverNamesComparator();

        this.versions.assertSortedRuns();
    }

    /**
     * Replays every log at or after the recorded log number. Logs older than that were already
     * folded into tables; replaying them would resurrect deleted keys at stale sequences.
     */
    private replayLogs(): void {
        const from = Math.min(
            this.versions.logNumber,
            this.versions.previousLogNumber === 0 ? this.versions.logNumber : this.versions.previousLogNumber
        );

        const logs = fs
            .readdirSync(this.directory)
            .map((name) => ({ name, parsed: parseFileName(name) }))
            .filter((entry) => entry.parsed?.kind === FileKind.Log && (entry.parsed.number ?? 0) >= from)
            .sort((a, b) => (a.parsed!.number ?? 0) - (b.parsed!.number ?? 0));

        // Damage is skipped and reported rather than refused, as upstream replays a log when
        // `paranoid_checks` is off, which is how Bedrock opens a world.
        let replayed = this.versions.lastSequence;
        for (const { name } of logs) {
            const report = (corruption: LogCorruption): void =>
                this.options.onCorruption({ file: name, ...corruption });
            for (const record of readLogRecords(fs.readFileSync(path.join(this.directory, name)), report)) {
                const decoded = WriteBatch.decodePrefix(record);
                if (decoded === null) {
                    report({ bytes: record.byteLength, reason: 'log record too small' });
                    continue;
                }

                this.applyBatch(decoded);
                if (decoded.damage !== null) report({ bytes: record.byteLength, reason: decoded.damage });

                // The header's count, not the operations read: a later batch's sequence follows it.
                const last = decoded.sequence + BigInt(Math.max(decoded.count, decoded.batch.count)) - 1n;
                if (last > replayed) replayed = last;
            }
        }

        this.versions.lastSequence = replayed;
    }

    private applyBatch({ sequence, batch }: { sequence: bigint; batch: WriteBatch }): void {
        let next = sequence;
        for (const operation of batch.entries()) {
            this.memtable.add(operation.key, next, operation.type, operation.value ?? null);
            next += 1n;
        }
    }

    private openLog(): void {
        const file = path.join(this.directory, logFileName(this.versions.logNumber));
        this.log = new AppendFile(file);
    }

    public async close(): Promise<void> {
        if (this.closed) return;

        // Flushed before the door shuts, not after: `flush` refuses to run on a closed database.
        // After a manifest failure the log keeps what the memtable holds, and replays it on open.
        if (!this.options.readOnly) {
            if (this.manifestFailure === null) await this.flush();
            await this.settleCommits();
            this.log?.sync();
        }

        await this.stopTableWorker();

        this.closed = true;

        this.log?.close();
        this.log = null;
        this.closeManifest();

        // A scan abandoned without being finished never releases what it held.
        this.activeScans = 0;
        this.retireTables([]);
        for (const { file } of this.tables.values()) file.close();
        this.tables.clear();

        this.lock?.release();
        this.lock = null;
    }

    private assertOpen(): void {
        if (this.closed) throw new LeveldbErrors.DatabaseIsClosed();
    }

    private assertWritable(): void {
        this.assertOpen();
        if (this.options.readOnly) throw new LeveldbErrors.DatabaseIsReadOnly();
    }

    // ---------------------------------------------------------------- reads

    public get(key: Buffer): Buffer | null {
        this.assertOpen();

        // A tombstone in the memtable has to stop the search, or an older table's value surfaces.
        const remembered = this.memtable.get(key);
        if (remembered.found) return remembered.value;

        const immutable = this.immutableMemtable?.get(key);
        if (immutable?.found) return immutable.value;

        // Tables are keyed by internal key, so seek to this user key's newest possible version and
        // take the first entry that lands on it. `candidates` already yields level 0 newest first,
        // so the first table with a hit holds the winning version.
        const target = lookupKey(key, MAX_SEQUENCE);

        let found = false;
        let value: Buffer | null = null;
        this.versions.visitCandidates(key, (file) => {
            const entry = this.table(file).lookup(target, key);
            if (entry === null || compareBytewise(extractUserKey(entry.key), key) !== 0) return false;

            found = true;
            if (parseInternalKey(entry.key).type !== ValueType.Deletion) value = Buffer.from(entry.value);
            return true;
        });

        return found ? value : null;
    }

    public has(key: Buffer): boolean {
        return this.get(key) !== null;
    }

    public *keys(range: KeyRange = {}): IterableIterator<Buffer> {
        for (const [key] of this.scan(range)) yield Buffer.from(key);
    }

    /**
     * Every live key and value in order.
     *
     * A merge across the memtables and the tables, taking the newest version of each user key and
     * dropping the ones whose newest version is a deletion. The scan reads the database as it was
     * at its first entry: writes made while it runs do not show up in it, and tables a compaction
     * replaces stay on disk until the scan ends.
     */
    public *entries(range: KeyRange = {}): IterableIterator<[Buffer, Buffer]> {
        for (const [userKey, value] of this.scan(range)) yield [Buffer.from(userKey), Buffer.from(value)];
    }

    /** The internal-key merge behind {@link entries}, yielding views its caller copies. */
    private *scan(range: KeyRange): IterableIterator<[Buffer, Buffer]> {
        this.assertOpen();
        this.activeScans++;

        try {
            const inRange = (file: FileMetaData): boolean =>
                (range.gte === undefined || compareBytewise(extractUserKey(file.largest), range.gte) >= 0) &&
                (range.lt === undefined || compareBytewise(extractUserKey(file.smallest), range.lt) < 0);
            const start = range.gte === undefined ? null : lookupKey(range.gte, MAX_SEQUENCE);

            // The memtables are copied so that a write during the scan cannot shift entries under it.
            const sources: Array<Iterator<{ internalKey: Buffer; value: Buffer | null }>> = [
                [...this.memtable.iterate()][Symbol.iterator]()
            ];
            if (this.immutableMemtable !== null) {
                sources.push([...this.immutableMemtable.iterate()][Symbol.iterator]());
            }

            // Level 0 files overlap, so each is a source of its own. Every deeper level is one sorted
            // run, read a file at a time.
            for (const file of this.versions.files(0)) {
                if (inRange(file)) sources.push(this.tableEntries([file], start)[Symbol.iterator]());
            }

            for (let level = 1; level < MAX_LEVELS; level++) {
                const files = this.versions.files(level).filter(inRange);
                if (files.length > 0) sources.push(this.tableEntries(files, start)[Symbol.iterator]());
            }

            let previousUserKey: Buffer | null = null;

            for (const { internalKey, value } of mergeSorted(sources, (a, b) =>
                compareInternalKeys(a.internalKey, b.internalKey)
            )) {
                const userKey = extractUserKey(internalKey);

                // Sources are ordered newest-first per user key, so the first sighting wins and every
                // later one is a superseded version.
                if (previousUserKey !== null && compareBytewise(previousUserKey, userKey) === 0) continue;

                previousUserKey = userKey;

                if (range.gte !== undefined && compareBytewise(userKey, range.gte) < 0) continue;
                if (range.lt !== undefined && compareBytewise(userKey, range.lt) >= 0) return;
                if (value === null) continue;

                yield [userKey, value];
            }
        } finally {
            // A scan resumed after `close` finds the count already cleared.
            if (this.activeScans > 0 && --this.activeScans === 0) this.retireTables([]);
        }
    }

    /**
     * The entries of a sorted run of tables, one table at a time, from `start` when given.
     *
     * @param files - Tables in key order whose ranges do not overlap.
     * @param start - The internal key to seek the first table to.
     */
    private *tableEntries(
        files: readonly FileMetaData[],
        start: Buffer | null
    ): IterableIterator<{ internalKey: Buffer; value: Buffer | null }> {
        for (const file of files) {
            const table = this.table(file);
            const entries =
                start === null ? table.entries({ useCache: false }) : table.seekFrom(start, { useCache: false });
            for (const entry of entries) {
                const { type } = parseInternalKey(entry.key);
                yield { internalKey: entry.key, value: type === ValueType.Deletion ? null : entry.value };
            }
        }
    }

    private table(file: FileMetaData): TableReader {
        const cached = this.tables.get(file.number);
        if (cached) return cached.reader;

        const handle = openTableFile(this.directory, file.number);
        const reader = new TableReader(handle, compareInternalKeys, {
            fileNumber: file.number,
            blockCache: this.blockCache
        });
        this.tables.set(file.number, { reader, file: handle });
        return reader;
    }

    private runTableWorker(task: TableWorkerTask): Promise<TableWorkerResult> {
        if (this.tableWorkerRequest !== null) {
            throw new LeveldbErrors.TableWorkerBusy();
        }

        const worker = this.getTableWorker();
        return new Promise((resolve, reject) => {
            this.tableWorkerRequest = { resolve, reject };
            worker.ref();
            try {
                worker.postMessage(task);
            } catch (error) {
                this.tableWorkerRequest = null;
                worker.unref();
                reject(asError(error));
            }
        });
    }

    private getTableWorker(): Worker {
        if (this.tableWorker !== null) return this.tableWorker;

        // An executable compiled ahead of time keeps its modules' `.ts` paths but embeds the worker
        // compiled, so only a worker loaded from source needs the TypeScript loader.
        const isTypeScript =
            import.meta.url.endsWith('.ts') && typeof JSP_EMBEDDED_TABLE_BUILDER_WORKER === 'undefined';
        // A SEA executable has no adjacent dist tree. Read the self-contained worker from its
        // embedded asset instead of resolving a path beside the bundled Database module.
        const workerPath =
            typeof JSP_EMBEDDED_TABLE_BUILDER_WORKER !== 'undefined'
                ? new URL(JSP_EMBEDDED_TABLE_BUILDER_WORKER)
                : typeof JSP_SEA_TABLE_BUILDER_WORKER === 'undefined'
                  ? new URL(isTypeScript ? './db/TableBuilderWorker.ts' : './db/TableBuilderWorker.js', import.meta.url)
                  : this.singleExecutableTableWorkerUrl(JSP_SEA_TABLE_BUILDER_WORKER);
        const worker = new Worker(workerPath, {
            execArgv: isTypeScript ? this.tableWorkerExecArgv() : process.execArgv
        });
        this.tableWorker = worker;
        worker.unref();

        worker.on('message', (reply: TableWorkerReply) => {
            const request = this.tableWorkerRequest;
            if (request === null) return;

            this.tableWorkerRequest = null;
            worker.unref();
            if ('error' in reply) request.reject(new LeveldbErrors.TableWorkerFailed({ message: reply.error }));
            else request.resolve(reply.result);
        });

        worker.on('error', (error: unknown) => this.failTableWorker(worker, asError(error)));
        worker.on('exit', (code) => {
            if (this.tableWorker === worker) this.tableWorker = null;
            this.failTableWorker(worker, new LeveldbErrors.TableWorkerExited({ code }));
        });

        return worker;
    }

    private singleExecutableTableWorkerUrl(asset: string): URL {
        // `createRequire` resolves dynamic built-ins without preserving their imported type.
        const sea = createRequire(process.execPath)('node:sea') as typeof import('node:sea');
        if (!sea.isSea()) throw new LeveldbErrors.EmbeddedTableWorkerOutsideExecutable();

        const source = Buffer.from(sea.getAsset(asset)).toString('base64');
        return new URL(`data:text/javascript;base64,${source}`);
    }

    private failTableWorker(worker: Worker, error: Error): void {
        if (this.tableWorker === worker) this.tableWorker = null;
        const request = this.tableWorkerRequest;
        this.tableWorkerRequest = null;
        request?.reject(error);
    }

    private async stopTableWorker(): Promise<void> {
        const worker = this.tableWorker;
        this.tableWorker = null;
        if (worker !== null) await worker.terminate();
    }

    private tableWorkerExecArgv(): string[] {
        const loaderFlags = ['--import', '--loader', '--experimental-loader', '--experimental-transform-types'];
        if (
            process.execArgv.some((argument) =>
                loaderFlags.some((flag) => argument === flag || argument.startsWith(`${flag}=`))
            )
        ) {
            return process.execArgv;
        }

        // Node strips the worker's types itself; the repository's resolver adds the extensionless
        // relative imports the source uses. Only a checkout runs the worker from source.
        const resolver = new URL('../../../scripts/native-typescript-loader.mjs', import.meta.url).href;
        return [...process.execArgv, '--import', resolver];
    }

    // ---------------------------------------------------------------- writes

    public put(key: Buffer, value: Buffer): void {
        this.write(new WriteBatch().put(key, value));
    }

    public del(key: Buffer): void {
        this.write(new WriteBatch().del(key));
    }

    /**
     * Appends a batch to the log and applies it before returning.
     *
     * @param options - `sync` to fsync the log before returning.
     * @throws {Error} When a {@link Database.commit} is still appending, which this would overtake,
     *   or when an earlier commit failed.
     */
    public write(batch: WriteBatch, options: WriteOptions = {}): void {
        this.assertCanWrite();
        if (batch.count === 0) return;
        if (this.log!.busy) throw new LeveldbErrors.CommitInProgress();

        // The log first, always. A batch that reached memory but not the log is a batch a crash
        // loses silently, and callers have no way to know which writes made it.
        const sequence = this.versions.lastSequence + 1n;
        const framed = frameLogRecord(batch.encode(sequence), this.log!.length);
        this.log!.append(framed.parts);
        this.bytesWritten += framed.length;
        if (options.sync ?? this.options.sync) this.log!.sync();

        this.apply(sequence, batch);
    }

    /**
     * Applies a batch now and appends it to the log on libuv's thread pool, so the server thread
     * does not wait for the disk.
     *
     * Reads see the batch as soon as this returns, before it is on disk, which is what they saw
     * when every write blocked. Commits append in the order they were made, one after another.
     * The log record is the batch's encoding framed as fragment headers over slices of it, so the
     * only copy of the values is the encoding itself. A record cut short by a crash replays as
     * nothing, so a commit is all of its keys or none of them.
     *
     * @param options - `sync` to fsync the log once the record is in it.
     * @returns Settles once the record is in the log, and synced when asked.
     * @throws {Error} When the append or the sync fails. The database then refuses every later
     *   write, because the memtable holds a batch the log may not.
     */
    public async commit(batch: WriteBatch, options: WriteOptions = {}): Promise<void> {
        this.assertCanWrite();
        if (batch.count === 0) return;

        const log = this.log!;
        const sequence = this.versions.lastSequence + 1n;
        const framed = frameLogRecord(batch.encode(sequence), log.length);
        const appended = log.appendLater(framed.parts);
        const synced = (options.sync ?? this.options.sync) ? log.syncLater() : undefined;
        this.bytesWritten += framed.length;
        this.apply(sequence, batch);

        try {
            // Both observed before either failure is thrown: a sync queued behind a failed
            // append rejects too, and left unobserved it would be an unhandled rejection.
            await Promise.all(synced === undefined ? [appended] : [appended, synced]);
        } catch (error) {
            this.commitFailure ??= asError(error);
            throw error;
        }
    }

    /**
     * Whether a {@link Database.commit} is still appending, which a {@link Database.write} would
     * overtake and so refuses.
     */
    public get appending(): boolean {
        return this.log?.busy ?? false;
    }

    private assertCanWrite(): void {
        this.assertWritable();
        if (this.commitFailure !== null) {
            throw new LeveldbErrors.WritesRefusedAfterCommitFailure({
                cause: this.commitFailure
            });
        }
        if (this.manifestFailure !== null) {
            throw new LeveldbErrors.WritesRefusedAfterManifestFailure({
                cause: this.manifestFailure
            });
        }
        if (this.backgroundFlushError !== null) {
            const error = this.backgroundFlushError;
            this.backgroundFlushError = null;
            throw error;
        }
    }

    /** Puts an appended batch into the memtable and schedules a flush once the memtable is full. */
    private apply(sequence: bigint, batch: WriteBatch): void {
        this.applyBatch({ sequence, batch });
        this.versions.lastSequence = sequence + BigInt(batch.count) - 1n;

        if (this.memtable.size >= this.options.writeBufferSize) {
            this.scheduleBackgroundFlush();
        }
    }

    /**
     * Settles once no commit is appending. Checked again after each wait, because a commit made
     * while one was waiting queues behind it, and the caller syncs or closes the log in the same
     * turn this returns.
     */
    private async settleCommits(): Promise<void> {
        while (this.log?.busy) await this.log.drain();
    }

    /** Turns the memtable into a table off-thread, then compacts any level over its size budget. */
    public flush(): Promise<void> {
        this.assertWritable();
        // A flush or compaction would allocate table numbers the manifest may already name.
        if (this.manifestFailure !== null) {
            return Promise.reject(
                new LeveldbErrors.FlushRefusedAfterManifestFailure({
                    cause: this.manifestFailure
                })
            );
        }
        if (this.flushPromise !== null) {
            this.flushRequested = true;
            return this.flushPromise;
        }

        const operation = this.flushLoop();
        let tracked: Promise<void>;
        tracked = operation.finally(() => {
            if (this.flushPromise === tracked) this.flushPromise = null;
        });
        this.flushPromise = tracked;
        return tracked;
    }

    private async flushLoop(): Promise<void> {
        do {
            this.flushRequested = false;
            if (!this.memtable.empty) await this.flushMemTable();
            for (;;) {
                const plan = this.nextCompactionPlan();
                if (plan === null) break;
                await this.compact(plan);
            }
        } while (this.flushRequested);
        this.backgroundFlushError = null;
    }

    private scheduleBackgroundFlush(): void {
        if (this.flushPromise !== null) {
            this.flushRequested = true;
            return;
        }

        void this.flush().catch((error: unknown) => {
            this.backgroundFlushError = asError(error);
        });
    }

    private async flushMemTable(): Promise<void> {
        const frozen = this.memtable;
        const bounds = frozen.bounds();
        if (bounds === null) return;

        const number = this.versions.allocateFileNumber();
        this.memtable = new MemTable();
        this.immutableMemtable = frozen;
        const tablePath = path.join(this.directory, tableFileName(number));
        const hadOpenLog = this.log !== null;
        let installed = false;

        try {
            const result = await this.runTableWorker({
                kind: 'build',
                filePath: tablePath,
                fileNumber: number,
                entries: [...frozen.iterate()].map(({ internalKey, value }) => ({
                    internalKey,
                    value: value ?? Buffer.alloc(0)
                })),
                smallest: bounds.smallest,
                largest: bounds.largest,
                options: this.workerTableOptions()
            });
            if (result.kind !== 'built') throw new LeveldbErrors.TableWorkerAnsweredFlushWithCompaction();
            this.bytesWritten += result.file.size;

            // A commit made since the memtable froze appends to this log. It has to land before
            // the log is synced and closed, and before the memtable is asked whether it is empty.
            await this.settleCommits();
            const previousLog = this.versions.logNumber;
            const nextLog = this.versions.allocateFileNumber();
            const keepPreviousLog = this.memtable.empty ? 0 : previousLog;
            this.log?.sync();
            this.log?.close();
            this.log = null;
            this.applyAndPersist({
                logNumber: nextLog,
                previousLogNumber: keepPreviousLog,
                newFiles: [[0, this.toFileMetaData(result.file)]]
            });
            installed = true;
            this.immutableMemtable = null;

            if (hadOpenLog) this.openLog();
            try {
                this.discardStaleLogs(nextLog, keepPreviousLog);
            } catch {
                // Log cleanup is safe to retry on the next open after the manifest is durable.
            }
        } catch (error) {
            if (installed) {
                this.immutableMemtable = null;
                throw error;
            }

            for (const entry of frozen.iterate()) {
                const parsed = parseInternalKey(entry.internalKey);
                this.memtable.add(extractUserKey(entry.internalKey), parsed.sequence, parsed.type, entry.value);
            }
            this.immutableMemtable = null;
            if (hadOpenLog && this.log === null) this.openLog();
            if (this.manifestFailure === null) fs.rmSync(tablePath, { force: true });
            throw error;
        }
    }

    private nextCompactionPlan(): { sourceLevel: number; targetLevel: number; inputs: FileMetaData[] } | null {
        const level0 = this.versions.files(0);
        const level0Trigger = Math.max(1, Math.trunc(this.options.l0CompactionTrigger));
        if (level0.length >= level0Trigger) {
            // Level 0 is newest first. Promote only the oldest bounded group so one flush never
            // rewrites every accumulated level 0 table and newer files keep their precedence.
            return {
                sourceLevel: 0,
                targetLevel: 1,
                inputs: [...level0.slice(-level0Trigger)]
            };
        }

        for (let sourceLevel = 1; sourceLevel < MAX_LEVELS - 1; sourceLevel++) {
            const files = this.versions.files(sourceLevel);
            const bytes = files.reduce((total, file) => total + file.size, 0);
            // Leveled runs grow by a factor of ten. This keeps compaction work local to a bounded
            // source file and its overlaps instead of repeatedly rewriting all of level 1.
            if (bytes > this.options.maxFileSize * 10 ** sourceLevel) {
                const inputs = this.versions.withBoundaryInputs(sourceLevel, files[0] ? [files[0]] : []);
                return { sourceLevel, targetLevel: sourceLevel + 1, inputs };
            }
        }

        return null;
    }

    private async compact(plan: { sourceLevel: number; targetLevel: number; inputs: FileMetaData[] }): Promise<void> {
        if (plan.inputs.length === 0) return;

        let smallest = plan.inputs[0]!.smallest;
        let largest = plan.inputs[0]!.largest;
        for (const file of plan.inputs) {
            if (compareInternalKeys(file.smallest, smallest) < 0) smallest = file.smallest;
            if (compareInternalKeys(file.largest, largest) > 0) largest = file.largest;
        }

        const overlapping = this.versions.overlapping(plan.targetLevel, smallest, largest);
        const inputs = [...plan.inputs, ...overlapping];
        const deeperRanges = this.versions
            .allFiles()
            .filter(({ level }) => level > plan.targetLevel)
            .map(({ file }) => ({ smallest: file.smallest, largest: file.largest }));
        const result = await this.runTableWorker({
            kind: 'compact',
            directory: this.directory,
            inputs: inputs.map((file) => this.toWorkerFileMetadata(file)),
            deeperRanges,
            outputLevel: plan.targetLevel,
            firstOutputNumber: this.versions.nextFileNumber,
            maxFileSize: this.options.maxFileSize,
            options: this.workerTableOptions()
        });
        if (result.kind !== 'compacted') throw new LeveldbErrors.TableWorkerAnsweredCompactionWithFlush();
        for (const [, file] of result.outputs) this.bytesWritten += file.size;

        try {
            this.applyAndPersist({
                nextFileNumber: result.nextFileNumber,
                deletedFiles: [
                    ...plan.inputs.map((file): [number, number] => [plan.sourceLevel, file.number]),
                    ...overlapping.map((file): [number, number] => [plan.targetLevel, file.number])
                ],
                newFiles: result.outputs.map(([level, file]): [number, FileMetaData] => [
                    level,
                    this.toFileMetaData(file)
                ])
            });
        } catch (error) {
            // The input tables remain authoritative until CURRENT names the replacement manifest.
            if (this.manifestFailure === null) {
                for (const [, file] of result.outputs) removeTableFile(this.directory, file.number);
            }
            throw error;
        }

        this.versions.assertSortedRuns();
    }

    private workerTableOptions(): WorkerTableOptions {
        return {
            blockSize: this.options.blockSize,
            blockRestartInterval: this.options.blockRestartInterval,
            compression: this.options.compression,
            compressionLevel: this.options.compressionLevel
        };
    }

    private toWorkerFileMetadata(file: FileMetaData): WorkerTableMetadata {
        return { number: file.number, size: file.size, smallest: file.smallest, largest: file.largest };
    }

    private toFileMetaData(file: WorkerTableMetadata): FileMetaData {
        return {
            number: file.number,
            size: file.size,
            smallest: Buffer.from(file.smallest),
            largest: Buffer.from(file.largest)
        };
    }

    /**
     * Applies an edit and records it in the manifest: appended and synced once, or as part of a
     * fresh snapshot when there is no manifest to append to or it has grown past
     * `MANIFEST_ROLL_BYTES`.
     *
     * The tables the edit adds are already on disk and fsynced by the time this runs, and the
     * files it removes are only unlinked afterwards - so at no point does the manifest name a file
     * that is missing. A crash during the append leaves a cut record at the manifest's end, which
     * recovery stops at, so the database reopens at the version before this edit.
     */
    private applyAndPersist(edit: VersionEdit): void {
        const updatedVersions = new VersionSet();
        updatedVersions.applyEdit(this.versions.snapshot(BYTEWISE_COMPARATOR));
        updatedVersions.applyEdit(edit);

        const manifest = this.manifest;
        if (manifest === null || manifest.length >= MANIFEST_ROLL_BYTES) {
            this.writeManifest(updatedVersions);
        } else {
            // Every edit carries the counters, as upstream's do, so replaying any prefix of the
            // manifest restores numbers no file has used yet.
            const framed = frameLogRecord(
                encodeVersionEdit({
                    ...edit,
                    logNumber: updatedVersions.logNumber,
                    previousLogNumber: updatedVersions.previousLogNumber,
                    nextFileNumber: updatedVersions.nextFileNumber,
                    lastSequence: updatedVersions.lastSequence
                }),
                manifest.length
            );
            // Each new table was synced, but not the directory entry naming it. Without this a
            // power loss can keep the manifest's edit and lose the table it names. A rewrite of
            // CURRENT syncs the directory as part of the rename, so only an append needs it.
            if ((edit.newFiles ?? []).length > 0) syncDirectory(this.directory);
            try {
                manifest.append(framed.parts);
                manifest.sync();
            } catch (error) {
                // Some of the edit may have reached the file, naming tables the caller is about
                // to delete. A fresh manifest of the version before it takes over from that one.
                this.closeManifest();
                try {
                    this.writeManifest(this.versions);
                } catch (rollbackError) {
                    // CURRENT may name an edit that did land, so its tables have to stay, and
                    // nothing more can be recorded. Upstream stops writing the same way.
                    this.manifestFailure ??= asError(rollbackError);
                }
                throw error;
            }
            this.bytesWritten += framed.length;
        }

        this.versions = updatedVersions;

        this.retireTables((edit.deletedFiles ?? []).map(([, number]) => number));
    }

    /**
     * Closes and deletes tables the current version no longer names, or holds them until the last
     * running scan ends, since a scan may still read them.
     *
     * @param numbers - Tables just dropped from the version.
     */
    private retireTables(numbers: readonly number[]): void {
        this.retiredTables.push(...numbers);
        if (this.activeScans > 0) return;

        // The edit retiring them is already recorded, so nothing here may fail the caller, who
        // would otherwise treat that edit as never made.
        for (const number of this.retiredTables.splice(0)) {
            try {
                this.dropTable(number);
            } catch {
                // The descriptor is abandoned; the table is no longer read through it.
            }
            try {
                removeTableFile(this.directory, number);
            } catch {
                // Left behind; the next open deletes a table the manifest does not name.
            }
        }
    }

    /** Writes a fresh manifest holding a snapshot of `versions`, points `CURRENT` at it and keeps it open. */
    private writeManifest(versions: VersionSet = this.versions): void {
        const number = versions.allocateFileNumber();
        const writer = new LogWriter();
        writer.append(encodeVersionEdit(versions.snapshot(BYTEWISE_COMPARATOR)));

        const name = manifestFileName(number);
        const manifest = writer.finish();
        const current = Buffer.from(`${name}\n`);
        writeFileSynced(path.join(this.directory, name), manifest);
        try {
            replaceFileAtomically(path.join(this.directory, CURRENT_FILE_NAME), current);
            this.bytesWritten += manifest.byteLength + current.byteLength;
            this.closeManifest();
            this.manifest = new AppendFile(path.join(this.directory, name));
        } catch (error) {
            // CURRENT may already name the new manifest, and with it tables the caller would
            // otherwise delete as never installed. Keep them, and record nothing more.
            this.manifestFailure ??= asError(error);
            throw error;
        }

        try {
            this.discardStaleManifests(number);
        } catch {
            // Cleanup is best-effort after CURRENT has been atomically switched to this manifest.
        }
    }

    /** Lets go of the manifest. A failed close is ignored: nothing more is appended through it either way. */
    private closeManifest(): void {
        try {
            this.manifest?.close();
        } catch {
            // The handle is abandoned, which is all a failure path needs of it.
        } finally {
            this.manifest = null;
        }
    }

    private discardStaleManifests(keep: number): void {
        for (const name of fs.readdirSync(this.directory)) {
            const parsed = parseFileName(name);
            if (parsed?.kind !== FileKind.Manifest || parsed.number === keep) continue;

            try {
                fs.unlinkSync(path.join(this.directory, name));
            } catch {
                // Left behind; harmless, since CURRENT names the one that counts.
            }
        }
    }

    private discardStaleLogs(keep: number, previous: number = 0): void {
        for (const name of fs.readdirSync(this.directory)) {
            const parsed = parseFileName(name);
            if (parsed?.kind !== FileKind.Log || parsed.number === keep || parsed.number === previous) continue;

            try {
                fs.unlinkSync(path.join(this.directory, name));
            } catch {
                // Left behind; harmless, since recovery only replays what the manifest names.
            }
        }
    }

    /**
     * Deletes tables the manifest does not name. A crash between writing a table and naming it in
     * the manifest leaves one behind, as does an interrupted compaction, and upstream LevelDB
     * deletes them on open the same way. Runs only at open, when no table is being written.
     */
    private discardOrphanTables(): void {
        const live = new Set(this.versions.allFiles().map(({ file }) => file.number));
        for (const name of fs.readdirSync(this.directory)) {
            const parsed = parseFileName(name);
            if (parsed?.kind !== FileKind.Table || parsed.number === undefined || live.has(parsed.number)) continue;

            try {
                fs.unlinkSync(path.join(this.directory, name));
            } catch {
                // Left behind; tried again on the next open.
            }
        }
    }

    private dropTable(number: number): void {
        const cached = this.tables.get(number);
        if (!cached) return;

        this.tables.delete(number);
        this.blockCache.deleteFile(number);
        cached.file.close();
    }

    public get stats(): DatabaseStats {
        return {
            level0Files: this.versions.files(0).length,
            totalFiles: this.versions.totalFiles,
            memtableBytes: this.memtable.size + (this.immutableMemtable?.size ?? 0),
            lastSequence: this.versions.lastSequence,
            bytesWritten: this.bytesWritten,
            blockCache: this.blockCache.stats
        };
    }

    /** For diagnostics: how many files sit at each level. */
    public get levelSizes(): number[] {
        return Array.from({ length: MAX_LEVELS }, (_, level) => this.versions.files(level).length);
    }
}

export default Database;
