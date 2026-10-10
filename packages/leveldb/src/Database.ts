import fs from 'node:fs';
import path from 'node:path';

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
import { TableBuilder } from './format/TableBuilder';
import { TableReader } from './format/TableReader';
import {
    MAX_SEQUENCE,
    ValueType,
    compareInternalKeys,
    extractUserKey,
    findShortInternalSuccessor,
    findShortestInternalSeparator,
    lookupKey,
    parseInternalKey
} from './format/InternalKey';
import { WriteBatch } from './format/WriteBatch';
import { decodeVersionEdit, encodeVersionEdit } from './db/VersionEdit';
import { resolveOptions } from './DatabaseOptions';
import type { DatabaseOptions, ResolvedOptions } from './DatabaseOptions';
import type { FileMetaData, VersionEdit } from './db/VersionEdit';

export interface DatabaseStats {
    level0Files: number;
    totalFiles: number;
    memtableBytes: number;
    lastSequence: bigint;
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
    private readonly versions = new VersionSet();
    private readonly tables = new Map<number, { reader: TableReader; file: TableFile }>();

    private lock: DirectoryLock | null = null;
    private memtable = new MemTable();
    private log: AppendFile | null = null;
    private logWriter: LogWriter | null = null;
    private closed = false;

    private constructor(directory: string, options: ResolvedOptions) {
        this.directory = directory;
        this.options = options;
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

        // Tables are keyed by internal key, so seek to this user key's newest possible version and
        // take the first entry that lands on it. `candidates` already yields level 0 newest first,
        // so the first table with a hit holds the winning version.
        const target = lookupKey(key, MAX_SEQUENCE);

        for (const { file } of this.versions.candidates(key)) {
            for (const entry of this.table(file).seekFrom(target)) {
                if (compareBytewise(extractUserKey(entry.key), key) !== 0) break;

                return parseInternalKey(entry.key).type === ValueType.Deletion ? null : Buffer.from(entry.value);
            }
        }

        return null;
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
            this.memtable.iterate()[Symbol.iterator]() as Iterator<{ internalKey: Buffer; value: Buffer | null }>
        ];

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
        for (const entry of this.table(file).entries()) {
            const { type } = parseInternalKey(entry.key);
            yield { internalKey: entry.key, value: type === ValueType.Deletion ? null : entry.value };
        }
    }

    private table(file: FileMetaData): TableReader {
        const cached = this.tables.get(file.number);
        if (cached) return cached.reader;

        const handle = new TableFile(path.join(this.directory, tableFileName(file.number)));
        const reader = new TableReader(handle, compareInternalKeys);
        this.tables.set(file.number, { reader, file: handle });
        return reader;
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
        if (batch.count === 0) return;

        // The log first, always. A batch that reached memory but not the log is a batch a crash
        // loses silently, and callers have no way to know which writes made it.
        const sequence = this.versions.lastSequence + 1n;
        this.logWriter!.append(batch.encode(sequence));
        this.log!.append(this.logWriter!.finish());
        this.logWriter = new LogWriter(this.log!.length);
        if (this.options.sync) this.log!.sync();

        this.applyBatch({ sequence, batch });
        this.versions.lastSequence = sequence + BigInt(batch.count) - 1n;

        if (this.memtable.size >= this.options.writeBufferSize) {
            void this.flush();
        }
    }

    /** Turns everything in memory into a table, compacts if that made level 0 too deep, fsyncs. */
    public async flush(): Promise<void> {
        this.assertWritable();

        if (!this.memtable.empty) await this.flushMemTable();
        while (this.versions.files(0).length >= this.options.l0CompactionTrigger) {
            const compacted = await this.compactLevel0();
            if (!compacted) break;
        }
    }

    private async flushMemTable(): Promise<void> {
        const bounds = this.memtable.bounds();
        if (bounds === null) return;

        const builder = this.newTableBuilder();
        for (const entry of this.memtable.iterate()) {
            builder.add(entry.internalKey, entry.value ?? Buffer.alloc(0));
        }

        const number = this.versions.allocateFileNumber();
        const bytes = builder.finish();
        writeFileSynced(path.join(this.directory, tableFileName(number)), bytes);

        const previousLog = this.versions.logNumber;
        this.memtable = new MemTable();

        // A new log, so recovery after this point does not replay what is now in the table.
        this.versions.logNumber = this.versions.allocateFileNumber();
        this.applyAndPersist({
            logNumber: this.versions.logNumber,
            newFiles: [[0, { number, size: bytes.byteLength, smallest: bounds.smallest, largest: bounds.largest }]]
        });

        this.log?.close();
        this.openLog();
        this.discardLog(previousLog);
    }

    /**
     * Merges all of level 0 with every level 1 file it overlaps.
     *
     * Level 0 files overlap each other, so they are merged as a set rather than one at a time.
     * Levels below 1 are left to the game's own compaction, which will push level 1 down when it
     * outgrows its budget - a database with a deep level 1 and empty levels beneath is legal.
     */
    private async compactLevel0(): Promise<boolean> {
        const inputs0 = [...this.versions.files(0)];
        if (inputs0.length === 0) return false;

        let smallest = inputs0[0]!.smallest;
        let largest = inputs0[0]!.largest;
        for (const file of inputs0) {
            if (compareInternalKeys(file.smallest, smallest) < 0) smallest = file.smallest;
            if (compareInternalKeys(file.largest, largest) > 0) largest = file.largest;
        }

        const inputs1 = this.versions.overlapping(1, smallest, largest);
        const sources = [...inputs0, ...inputs1].map((file) => this.table(file).entries()[Symbol.iterator]());

        const outputs: Array<[number, FileMetaData]> = [];
        let builder: TableBuilder | null = null;
        let number = 0;
        let fileSmallest: Buffer | null = null;
        let fileLargest: Buffer | null = null;
        let previousUserKey: Buffer | null = null;

        const finishFile = (): void => {
            if (builder === null || fileSmallest === null || fileLargest === null) return;

            const bytes = builder.finish();
            writeFileSynced(path.join(this.directory, tableFileName(number)), bytes);
            outputs.push([1, { number, size: bytes.byteLength, smallest: fileSmallest, largest: fileLargest }]);
            builder = null;
            fileSmallest = null;
            fileLargest = null;
        };

        for (const entry of mergeSorted(sources, (a, b) => compareInternalKeys(a.key, b.key))) {
            const userKey = extractUserKey(entry.key);

            // Only the newest version of each key survives, and a deletion can be dropped outright
            // because there is no older level left below to shadow.
            if (previousUserKey !== null && compareBytewise(previousUserKey, userKey) === 0) continue;

            previousUserKey = Buffer.from(userKey);
            if (parseInternalKey(entry.key).type === ValueType.Deletion) continue;

            if (builder === null) {
                builder = this.newTableBuilder();
                number = this.versions.allocateFileNumber();
                fileSmallest = Buffer.from(entry.key);
            }

            builder.add(entry.key, entry.value);
            fileLargest = Buffer.from(entry.key);

            if (builder.size >= this.options.maxFileSize) finishFile();
        }

        finishFile();

        this.applyAndPersist({
            deletedFiles: [
                ...inputs0.map((file) => [0, file.number] as [number, number]),
                ...inputs1.map((file) => [1, file.number] as [number, number])
            ],
            newFiles: outputs
        });

        for (const file of [...inputs0, ...inputs1]) this.dropTable(file.number);
        this.versions.assertSortedRuns();
        return true;
    }

    private newTableBuilder(): TableBuilder {
        return new TableBuilder({
            blockSize: this.options.blockSize,
            blockRestartInterval: this.options.blockRestartInterval,
            compression: this.options.compression,
            compressionLevel: this.options.compressionLevel,
            shortestSeparator: findShortestInternalSeparator,
            shortSuccessor: findShortInternalSuccessor
        });
    }

    /**
     * Applies an edit and rewrites the manifest to match.
     *
     * The tables the edit adds are already on disk and fsynced by the time this runs, and the
     * files it removes are only unlinked afterwards - so at no point does the manifest name a file
     * that is missing.
     */
    private applyAndPersist(edit: VersionEdit): void {
        this.versions.applyEdit(edit);
        this.writeManifest();

        for (const [, number] of edit.deletedFiles ?? []) {
            try {
                fs.unlinkSync(path.join(this.directory, tableFileName(number)));
            } catch {
                // Already gone. Not worth failing a compaction over.
            }
        }
    }

    private writeManifest(): void {
        const number = this.versions.allocateFileNumber();
        const writer = new LogWriter();
        writer.append(encodeVersionEdit(this.versions.snapshot(BYTEWISE_COMPARATOR)));

        const name = manifestFileName(number);
        writeFileSynced(path.join(this.directory, name), writer.finish());
        replaceFileAtomically(path.join(this.directory, CURRENT_FILE_NAME), Buffer.from(`${name}\n`));

        this.discardStaleManifests(number);
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

    private discardLog(number: number): void {
        if (number === 0) return;

        try {
            fs.unlinkSync(path.join(this.directory, logFileName(number)));
        } catch {
            // Left behind. Recovery ignores logs older than the recorded log number.
        }
    }

    private dropTable(number: number): void {
        const cached = this.tables.get(number);
        if (!cached) return;

        cached.file.close();
        this.tables.delete(number);
    }

    public get stats(): DatabaseStats {
        return {
            level0Files: this.versions.files(0).length,
            totalFiles: this.versions.totalFiles,
            memtableBytes: this.memtable.size,
            lastSequence: this.versions.lastSequence
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
        for (let i = 0; i < heads.length; i++) {
            if (heads[i]!.done) continue;
            if (best === -1 || compare(heads[i]!.value as T, heads[best]!.value as T) < 0) best = i;
        }

        if (best === -1) return;

        yield heads[best]!.value as T;
        heads[best] = sources[best]!.next();
    }
}

export default Database;
