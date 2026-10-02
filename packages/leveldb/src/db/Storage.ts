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

export const writeFileSynced = (file: string, data: Buffer): void => {
    const descriptor = fs.openSync(file, 'w');
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

/** An append-only handle over a log file, kept open for the life of the log. */
export class AppendFile {
    private readonly descriptor: number;
    private written: number;

    public constructor(file: string) {
        this.descriptor = fs.openSync(file, 'a');
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
