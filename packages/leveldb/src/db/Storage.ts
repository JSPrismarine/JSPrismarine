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

/** An append-only handle over a log file, kept open for the life of the log. */
export class AppendFile {
    private readonly descriptor: number;
    private written: number;

    public constructor(file: string) {
        this.descriptor = openAppendable(file);
        this.written = fs.fstatSync(this.descriptor).size;
    }

    public get length(): number {
        return this.written;
    }

    public append(data: Buffer): void {
        if (data.byteLength === 0) return;

        fs.writeSync(this.descriptor, data);
        this.written += data.byteLength;
    }

    public sync(): void {
        fs.fsyncSync(this.descriptor);
    }

    public close(): void {
        fs.closeSync(this.descriptor);
    }
}

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
