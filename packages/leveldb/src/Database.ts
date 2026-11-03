import fs from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { Worker } from 'node:worker_threads';
import { pathToFileURL } from 'node:url';

import { AppendFile, TableFile, replaceFileAtomically, writeFileSynced } from './db/Storage';
import { BYTEWISE_COMPARATOR, compareBytewise } from './util/Comparator';
import { CorruptionError } from './Errors';
import {
    CURRENT_FILE_NAME,
    FileKind,
    logFileName,
    manifestFileName,
    parseFileName,
    tableFileName
} from './util/FileNames';
import { DirectoryLock } from './db/DirectoryLock';
import { LogWriter, readLogRecords } from './format/LogFormat';
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
import { decodeVersionEdit, encodeVersionEdit } from './db/VersionEdit';
import { resolveOptions } from './DatabaseOptions';
import type { DatabaseOptions, ResolvedOptions } from './DatabaseOptions';
import type { FileMetaData, VersionEdit } from './db/VersionEdit';
import type { BlockCacheStats } from './format/BlockCache';
import type {
    TableWorkerReply,
    TableWorkerResult,
    TableWorkerTask,
    WorkerTableMetadata,
    WorkerTableOptions
} from './db/TableWorkerProtocol';

/** The worker asset name defined by `scripts/package-sea.mts` for Node SEA builds. */
declare const JSP_SEA_TABLE_BUILDER_WORKER: string | undefined;

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

export interface KeyRange {
    gte?: Buffer;
    lt?: Buffer;
}

/**
 * A LevelDB database, able to read and write the ones Minecraft: Bedrock Edition keeps its worlds
 * in.
 *
 * The one deliberate departure from upstream: we read manifests the game wrote, but never append
 * to one. After recovery a fresh `MANIFEST-<n>` holding a full snapshot is written and `CURRENT`
 * repointed at it. Upstream does the same whenever it decides the manifest wants replacing; doing
 * it unconditionally bounds manifest growth and means the only VersionEdit encoding that has to
 * be exactly right is the one a round-trip test covers.
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
    private logWriter: LogWriter | null = null;
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
            throw new Error(`A database already exists at ${this.directory}`);
        }

        if (!exists && !this.options.createIfMissing && !this.options.readOnly) {
            throw new Error(`No database at ${this.directory}`);
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
    }

    private readManifest(): void {
        const current = fs.readFileSync(path.join(this.directory, CURRENT_FILE_NAME), 'utf8').trim();
        if (current.length === 0) throw new CorruptionError('CURRENT is empty');

        const manifest = path.join(this.directory, current);
        if (!fs.existsSync(manifest)) throw new CorruptionError(`CURRENT names ${current}, which does not exist`);

        let sawComparator = false;
        for (const record of readLogRecords(fs.readFileSync(manifest))) {
            const edit = decodeVersionEdit(record);

            if (edit.comparator !== undefined) {
                if (edit.comparator !== BYTEWISE_COMPARATOR) {
                    throw new CorruptionError(
                        `Database uses the ${edit.comparator} comparator, whose ordering is unknown here`
                    );
                }

                sawComparator = true;
            }

            this.versions.applyEdit(edit);
        }

        if (!sawComparator) throw new CorruptionError('Manifest never names a comparator');

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

        for (const { name } of logs) {
            for (const record of readLogRecords(fs.readFileSync(path.join(this.directory, name)))) {
                this.applyBatch(WriteBatch.decode(record));
            }
        }

        const replayed = this.memtable.maxSequence();
        if (replayed > this.versions.lastSequence) this.versions.lastSequence = replayed;
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
        this.logWriter = new LogWriter(this.log.length);
    }

    public async close(): Promise<void> {
        if (this.closed) return;

        // Flushed before the door shuts, not after: `flush` refuses to run on a closed database.
        if (!this.options.readOnly) {
            await this.flush();
            this.log?.sync();
        }

        await this.stopTableWorker();

        this.closed = true;

        this.log?.close();
        this.log = null;

        for (const { file } of this.tables.values()) file.close();
        this.tables.clear();

        this.lock?.release();
        this.lock = null;
    }

    private assertOpen(): void {
        if (this.closed) throw new Error('Database is closed');
    }

    private assertWritable(): void {
        this.assertOpen();
        if (this.options.readOnly) throw new Error('Database was opened read-only');
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
        for (const [key] of this.entries(range)) yield key;
    }

    /**
     * Every live key and value in order.
     *
     * A merge across the memtable and every table, taking the newest version of each user key and
     * dropping the ones whose newest version is a deletion.
     */
    public *entries(range: KeyRange = {}): IterableIterator<[Buffer, Buffer]> {
        this.assertOpen();

        const sources: Array<Iterator<{ internalKey: Buffer; value: Buffer | null }>> = [
            this.memtable.iterate()[Symbol.iterator]()
        ];
        if (this.immutableMemtable !== null) {
            sources.push(this.immutableMemtable.iterate()[Symbol.iterator]());
        }

        for (const { file } of this.versions.allFiles()) {
            sources.push(this.tableEntries(file)[Symbol.iterator]());
        }

        let previousUserKey: Buffer | null = null;

        for (const { internalKey, value } of mergeSorted(sources, (a, b) =>
            compareInternalKeys(a.internalKey, b.internalKey)
        )) {
            const userKey = extractUserKey(internalKey);

            // Sources are ordered newest-first per user key, so the first sighting wins and every
            // later one is a superseded version.
            if (previousUserKey !== null && compareBytewise(previousUserKey, userKey) === 0) continue;

            previousUserKey = Buffer.from(userKey);

            if (range.gte !== undefined && compareBytewise(userKey, range.gte) < 0) continue;
            if (range.lt !== undefined && compareBytewise(userKey, range.lt) >= 0) return;
            if (value === null) continue;

            yield [Buffer.from(userKey), Buffer.from(value)];
        }
    }

    private *tableEntries(file: FileMetaData): IterableIterator<{ internalKey: Buffer; value: Buffer | null }> {
        for (const entry of this.table(file).entries({ useCache: false })) {
            const { type } = parseInternalKey(entry.key);
            yield { internalKey: entry.key, value: type === ValueType.Deletion ? null : entry.value };
        }
    }

    private table(file: FileMetaData): TableReader {
        const cached = this.tables.get(file.number);
        if (cached) return cached.reader;

        const handle = new TableFile(path.join(this.directory, tableFileName(file.number)));
        const reader = new TableReader(handle, compareInternalKeys, {
            fileNumber: file.number,
            blockCache: this.blockCache
        });
        this.tables.set(file.number, { reader, file: handle });
        return reader;
    }

    private runTableWorker(task: TableWorkerTask): Promise<TableWorkerResult> {
        if (this.tableWorkerRequest !== null) {
            throw new Error('The database already has a table worker request in flight');
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
                reject(error instanceof Error ? error : new Error(String(error)));
            }
        });
    }

    private getTableWorker(): Worker {
        if (this.tableWorker !== null) return this.tableWorker;

        const isTypeScript = import.meta.url.endsWith('.ts');
        // A SEA executable has no adjacent dist tree. Read the self-contained worker from its
        // embedded asset instead of resolving a path beside the bundled Database module.
        const workerPath =
            typeof JSP_SEA_TABLE_BUILDER_WORKER === 'undefined'
                ? new URL(
                      isTypeScript ? './db/TableBuilderWorker.ts' : './db/TableBuilderWorker.es.js',
                      import.meta.url
                  )
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
            if ('error' in reply) request.reject(new Error(reply.error));
            else request.resolve(reply.result);
        });

        worker.on('error', (error) => this.failTableWorker(worker, error));
        worker.on('exit', (code) => {
            if (this.tableWorker === worker) this.tableWorker = null;
            this.failTableWorker(worker, new Error(`Table worker exited before replying with code ${code}`));
        });

        return worker;
    }

    private singleExecutableTableWorkerUrl(asset: string): URL {
        // `createRequire` resolves dynamic built-ins without preserving their imported type.
        const sea = createRequire(process.execPath)('node:sea') as typeof import('node:sea');
        if (!sea.isSea()) throw new Error('The embedded LevelDB table worker requires a Node single executable');

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

        const tsxLoader = pathToFileURL(createRequire(import.meta.url).resolve('tsx')).href;
        return [...process.execArgv, '--import', tsxLoader];
    }

    // ---------------------------------------------------------------- writes

    public put(key: Buffer, value: Buffer): void {
        this.write(new WriteBatch().put(key, value));
    }

    public del(key: Buffer): void {
        this.write(new WriteBatch().del(key));
    }

    public write(batch: WriteBatch): void {
        this.assertWritable();
        if (this.backgroundFlushError !== null) {
            const error = this.backgroundFlushError;
            this.backgroundFlushError = null;
            throw error;
        }
        if (batch.count === 0) return;

        // The log first, always. A batch that reached memory but not the log is a batch a crash
        // loses silently, and callers have no way to know which writes made it.
        const sequence = this.versions.lastSequence + 1n;
        this.logWriter!.append(batch.encode(sequence));
        const logRecord = this.logWriter!.finish();
        this.log!.append(logRecord);
        this.bytesWritten += logRecord.byteLength;
        this.logWriter = new LogWriter(this.log!.length);
        if (this.options.sync) this.log!.sync();

        this.applyBatch({ sequence, batch });
        this.versions.lastSequence = sequence + BigInt(batch.count) - 1n;

        if (this.memtable.size >= this.options.writeBufferSize) {
            this.scheduleBackgroundFlush();
        }
    }

    /** Turns the memtable into a table off-thread, then compacts any level over its size budget. */
    public flush(): Promise<void> {
        this.assertWritable();
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
            this.backgroundFlushError = error instanceof Error ? error : new Error(String(error));
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
            if (result.kind !== 'built') throw new Error('Table worker returned a compaction result for a flush');
            this.bytesWritten += result.file.size;

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
            fs.rmSync(tablePath, { force: true });
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
                return { sourceLevel, targetLevel: sourceLevel + 1, inputs: files[0] ? [files[0]] : [] };
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
        if (result.kind !== 'compacted') throw new Error('Table worker returned a flush result for compaction');
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
            for (const [, file] of result.outputs) {
                fs.rmSync(path.join(this.directory, tableFileName(file.number)), { force: true });
            }
            throw error;
        }

        for (const file of inputs) this.dropTable(file.number);
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
     * Applies an edit and rewrites the manifest to match.
     *
     * The tables the edit adds are already on disk and fsynced by the time this runs, and the
     * files it removes are only unlinked afterwards - so at no point does the manifest name a file
     * that is missing.
     */
    private applyAndPersist(edit: VersionEdit): void {
        const updatedVersions = new VersionSet();
        updatedVersions.applyEdit(this.versions.snapshot(BYTEWISE_COMPARATOR));
        updatedVersions.applyEdit(edit);
        this.writeManifest(updatedVersions);
        this.versions = updatedVersions;

        for (const [, number] of edit.deletedFiles ?? []) {
            try {
                fs.unlinkSync(path.join(this.directory, tableFileName(number)));
            } catch {
                // Already gone. Not worth failing a compaction over.
            }
        }
    }

    private writeManifest(versions: VersionSet = this.versions): void {
        const number = versions.allocateFileNumber();
        const writer = new LogWriter();
        writer.append(encodeVersionEdit(versions.snapshot(BYTEWISE_COMPARATOR)));

        const name = manifestFileName(number);
        const manifest = writer.finish();
        const current = Buffer.from(`${name}\n`);
        writeFileSynced(path.join(this.directory, name), manifest);
        replaceFileAtomically(path.join(this.directory, CURRENT_FILE_NAME), current);
        this.bytesWritten += manifest.byteLength + current.byteLength;

        try {
            this.discardStaleManifests(number);
        } catch {
            // Cleanup is best-effort after CURRENT has been atomically switched to this manifest.
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

    private dropTable(number: number): void {
        const cached = this.tables.get(number);
        if (!cached) return;

        cached.file.close();
        this.tables.delete(number);
        this.blockCache.deleteFile(number);
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

/** Merges pre-sorted iterators into one sorted stream. */
function* mergeSorted<T>(sources: Array<Iterator<T>>, compare: (a: T, b: T) => number): IterableIterator<T> {
    const heads = sources.map((source) => source.next());

    for (;;) {
        let best = -1;
        let bestHead: IteratorYieldResult<T> | null = null;
        for (let i = 0; i < heads.length; i++) {
            const head = heads[i]!;
            if (head.done) continue;
            if (bestHead === null || compare(head.value, bestHead.value) < 0) {
                best = i;
                bestHead = head;
            }
        }

        if (bestHead === null) return;

        yield bestHead.value;
        heads[best] = sources[best]!.next();
    }
}

export default Database;
