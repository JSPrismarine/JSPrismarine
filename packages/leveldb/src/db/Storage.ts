import fs from 'node:fs';
import path from 'node:path';

import type { TableSource } from '../format/TableReader';

/**
 * File operations with the durability ordering LevelDB depends on.
 *
 * The rule everything here exists to serve: a file must be on disk before anything points at it,
 * and nothing may be deleted until what replaced it is pointed at. Get that order wrong and a
 * crash leaves a manifest naming a table that does not exist, which no reader can recover from.
 */

/** Directory fsync is how a rename becomes durable - and is not supported on Windows. */
export const syncDirectory = (directory: string): void => {
    if (process.platform === 'win32') return;

    const descriptor = fs.openSync(directory, 'r');
    try {
        fs.fsyncSync(descriptor);
    } finally {
        fs.closeSync(descriptor);
    }
};

/**
 * `O_NOFOLLOW` where the platform has it. Windows has no such flag, and there
 * {@link openAppendable} checks the entry with `lstat` instead.
 */
const NO_FOLLOW = fs.constants.O_NOFOLLOW ?? 0;

/**
 * `O_NONBLOCK` where the platform has it, so opening a FIFO that has no reader fails at once
 * instead of waiting for one. It changes nothing for a regular file.
 */
const NONBLOCK = fs.constants.O_NONBLOCK ?? 0;

/**
 * Writes a file this database is creating - a manifest, a table, a temporary - and flushes it.
 *
 * Each such name is freshly allocated, so anything already there is debris: a table a crash left
 * before the manifest named it, or a temporary from an interrupted replace. The entry is removed
 * and the file created exclusively (`wx`), which never follows a symbolic link. Writing with `w`,
 * as this used to, followed a link planted at the name and truncated whatever it pointed to,
 * outside the database directory. Should something reappear between the two steps, the create
 * fails rather than writing through it.
 */
export const writeFileSynced = (file: string, data: Buffer): void => {
    // `rm` on a symbolic link removes the link, never its target.
    fs.rmSync(file, { force: true });
    const descriptor = fs.openSync(file, 'wx');
    try {
        fs.writeSync(descriptor, data);
        fs.fsyncSync(descriptor);
    } finally {
        fs.closeSync(descriptor);
    }
};

/**
 * Replaces a file atomically: write a temporary, flush it, rename over the target, then flush the
 * directory so the rename itself survives. This is how CURRENT is updated - a half-written CURRENT
 * is an unopenable database.
 */
export const replaceFileAtomically = (file: string, data: Buffer): void => {
    const temporary = `${file}.dbtmp`;
    writeFileSynced(temporary, data);
    fs.renameSync(temporary, file);
    syncDirectory(path.dirname(file));
};

/**
 * Opens a log for appending, creating it when missing, without following a symbolic link.
 *
 * A log can be reopened after recovery, so unlike {@link writeFileSynced} an existing file is
 * kept. What is refused is anything but a plain file: a link at the name fails to open
 * (`O_NOFOLLOW`), a FIFO without a reader fails rather than blocking the open (`O_NONBLOCK`),
 * and the opened descriptor must be a regular file.
 */
const openAppendable = (file: string): number => {
    if (NO_FOLLOW === 0) {
        const entry = fs.lstatSync(file, { throwIfNoEntry: false });
        if (entry?.isSymbolicLink()) throw new Error(`${file} is a symbolic link`);
    }

    const { O_WRONLY, O_APPEND, O_CREAT } = fs.constants;
    const descriptor = fs.openSync(file, O_WRONLY | O_APPEND | O_CREAT | NO_FOLLOW | NONBLOCK, 0o666);
    if (!fs.fstatSync(descriptor).isFile()) {
        fs.closeSync(descriptor);
        throw new Error(`${file} is not a regular file`);
    }
    return descriptor;
};

/**
 * The parts left once `written` bytes of them have reached the file, for a vectored write the
 * operating system took only part of.
 */
const remainingParts = (parts: readonly Buffer[], written: number): Buffer[] => {
    const remaining: Buffer[] = [];
    let skip = written;
    for (const part of parts) {
        if (skip >= part.byteLength) {
            skip -= part.byteLength;
            continue;
        }
        remaining.push(skip === 0 ? part : part.subarray(skip));
        skip = 0;
    }
    return remaining;
};

const totalLength = (parts: readonly Buffer[]): number => parts.reduce((total, part) => total + part.byteLength, 0);

/**
 * An append-only handle over a log file, kept open for the life of the log.
 *
 * Appends run one after another in the order they were asked for, whether they block the caller
 * or run on libuv's thread pool, so a record is never interleaved with another and each one lands
 * at the offset it was framed for. {@link AppendFile.length} counts an append from the moment it
 * is asked for, which is the offset the next record has to be framed at.
 */
export class AppendFile {
    private readonly descriptor: number;
    private written: number;
    /** The appends and syncs still running on the thread pool, or null when none is. */
    private tail: Promise<void> | null = null;
    private pending = 0;
    /**
     * The first append on the thread pool that failed. The length counted it, so every record
     * framed after it was framed for an offset the file does not have, and none of them is
     * written.
     */
    private failure: unknown;

    public constructor(file: string) {
        this.descriptor = openAppendable(file);
        this.written = fs.fstatSync(this.descriptor).size;
    }

    /** The log's length once every append asked for so far has landed. */
    public get length(): number {
        return this.written;
    }

    /** Whether an append or sync is still running on the thread pool. */
    public get busy(): boolean {
        return this.pending > 0;
    }

    /**
     * Appends the parts with one vectored write before returning.
     * @throws {Error} When an append on the thread pool is still running, which this would overtake.
     */
    public append(parts: readonly Buffer[]): void {
        if (this.busy) throw new Error('An append is still running on this log');
        const length = totalLength(parts);
        if (length === 0) return;

        let remaining = [...parts];
        while (remaining.length > 0) remaining = remainingParts(remaining, fs.writevSync(this.descriptor, remaining));
        this.written += length;
    }

    /**
     * Appends the parts on libuv's thread pool, after every append and sync asked for before.
     * The length counts them at once, so after a failed append it no longer matches the file and
     * the caller has to stop appending.
     * @returns Settles once the parts are in the file. Rejects when this append fails, and
     *   without writing when an append asked for before it failed, since its record was framed
     *   for an offset past the one that failed.
     */
    public appendLater(parts: readonly Buffer[]): Promise<void> {
        this.written += totalLength(parts);
        return this.enqueue(async () => {
            this.assertNoFailedAppend();
            try {
                let remaining = [...parts];
                while (remaining.length > 0) {
                    const { bytesWritten } = await writev(this.descriptor, remaining);
                    remaining = remainingParts(remaining, bytesWritten);
                }
            } catch (error) {
                this.failure ??= error;
                throw error;
            }
        });
    }

    /**
     * Syncs the file on the thread pool once every append asked for before has landed.
     * @returns Settles once synced. Rejects when the sync fails, or when an append before it
     *   failed, since the file does not hold what was asked to be synced.
     */
    public syncLater(): Promise<void> {
        return this.enqueue(async () => {
            this.assertNoFailedAppend();
            await fsync(this.descriptor);
        });
    }

    private assertNoFailedAppend(): void {
        if (this.failure !== undefined) {
            throw new Error('An earlier append to this log failed', { cause: this.failure });
        }
    }

    /** Settles once nothing is running on the thread pool, whatever the outcome of the work. */
    public async drain(): Promise<void> {
        while (this.tail !== null) await this.tail;
    }

    private enqueue(work: () => Promise<void>): Promise<void> {
        this.pending++;
        const run = (this.tail ?? Promise.resolve()).then(work);
        // The tail never rejects, so a failed append does not fail the ones behind it on its
        // behalf: each caller sees its own outcome through `run`.
        const settled: Promise<void> = run
            .then(
                () => undefined,
                () => undefined
            )
            .then(() => {
                this.pending--;
                if (this.tail === settled) this.tail = null;
            });
        this.tail = settled;
        return run;
    }

    /**
     * Syncs the file before returning.
     * @throws {Error} When an append or sync on the thread pool is still running, which this
     *   would overtake.
     */
    public sync(): void {
        if (this.busy) throw new Error('An append is still running on this log');
        fs.fsyncSync(this.descriptor);
    }

    /**
     * Closes the file.
     * @throws {Error} When an append or sync on the thread pool is still running, which would
     *   then write to a closed descriptor.
     */
    public close(): void {
        if (this.busy) throw new Error('An append is still running on this log');
        fs.closeSync(this.descriptor);
    }
}

const writev = (descriptor: number, parts: readonly Buffer[]): Promise<{ bytesWritten: number }> =>
    new Promise((resolve, reject) => {
        fs.writev(descriptor, parts, (error, bytesWritten) => (error ? reject(error) : resolve({ bytesWritten })));
    });

const fsync = (descriptor: number): Promise<void> =>
    new Promise((resolve, reject) => {
        fs.fsync(descriptor, (error) => (error ? reject(error) : resolve()));
    });

/**
 * A table backed by a file descriptor rather than a Buffer, so opening a database does not read
 * every table into memory. The reader above it caches the blocks it decompresses.
 */
export class TableFile implements TableSource {
    private readonly descriptor: number;
    public readonly size: number;

    public constructor(file: string) {
        this.descriptor = fs.openSync(file, 'r');
        this.size = fs.fstatSync(this.descriptor).size;
    }

    public read(offset: number, length: number): Buffer {
        const buffer = Buffer.allocUnsafe(length);
        const read = fs.readSync(this.descriptor, buffer, 0, length, offset);

        if (read !== length) {
            throw new Error(`Read ${read} of ${length} bytes at offset ${offset}`);
        }

        return buffer;
    }

    public close(): void {
        fs.closeSync(this.descriptor);
    }
}
