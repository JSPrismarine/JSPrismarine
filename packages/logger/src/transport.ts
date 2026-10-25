import fs from 'node:fs';
import path from 'node:path';
import type { LogLevel } from './levels';
import { isAtLeastLevel } from './levels';

/** The part of a console the transport needs: a sink for one formatted line. */
export type ConsoleLike = {
    write: (input: string) => void;
};

/**
 * One log record as handed to transports: the raw parts plus the line the
 * logger already formatted for terminal output.
 */
export interface LogRecord {
    level: LogLevel;
    message: string;
    namespace: string;
    /** Wall-clock time as HH:mm:ss. */
    timestamp: string;
    /** The colorized console line. */
    formatted: string;
}

/** A destination for log records. */
export interface LogTransport {
    log(record: LogRecord): void;
    close?(): void;
}

/** Options for {@link PrismarineTransport}. */
export interface PrismarineTransportOptions {
    /**
     * Most records kept for replay while no console is attached; defaults to
     * 1000. When the buffer is full, the oldest record is dropped first.
     */
    capacity?: number;
}

/**
 * Transport for the interactive JSPrismarine console. Records are buffered
 * until a console attaches, then replayed in order, so lines logged during
 * boot still reach the console. The buffer holds at most `capacity` records;
 * once a console attaches, a dropped backlog is announced with one plain line
 * before the retained records are replayed.
 */
export class PrismarineTransport implements LogTransport {
    public console: ConsoleLike | undefined;
    private readonly capacity: number;
    private buffer: LogRecord[] = [];
    private droppedCount = 0;

    /**
     * @param options.capacity - Most records kept for replay; defaults to 1000.
     */
    public constructor(options: PrismarineTransportOptions = {}) {
        this.capacity = options.capacity ?? 1000;
    }

    /**
     * Records dropped from the replay buffer since the last replay. Resets to
     * zero once the retained records are written to the console.
     */
    public get dropped(): number {
        return this.droppedCount;
    }

    /**
     * Writes the record to the console, replaying any buffered records first.
     * Without a console the record is buffered, dropping the oldest when the
     * buffer is full.
     */
    public log(record: LogRecord): void {
        if (!this.console) {
            if (this.buffer.length >= this.capacity) {
                this.buffer.shift();
                this.droppedCount++;
            }
            this.buffer.push(record);
            return;
        }

        try {
            if (this.droppedCount > 0) {
                this.console.write(`... ${this.droppedCount} earlier log lines were not retained`);
                this.droppedCount = 0;
            }
            if (this.buffer.length > 0) {
                for (const buffered of this.buffer) {
                    this.console.write(buffered.formatted);
                }
                this.buffer = [];
            }

            this.console.write(record.formatted);
        } catch {}
    }
}

// biome-ignore lint/suspicious/noControlCharactersInRegex: the escapes are what gets stripped
const ANSI_PATTERN = /[\u001b\u009b][[()#;?]*(?:[0-9]{1,4}(?:;[0-9]{0,4})*)?[0-9A-ORZcf-nqry=><]/g;

/**
 * Transport that appends plain-text lines to a log file. Colors are stripped,
 * and the containing directory is created when missing.
 */
export class FileTransport implements LogTransport {
    private stream: fs.WriteStream;
    private readonly level: LogLevel;

    /**
     * @param options - Where to write and how verbose to be.
     * @param options.filename - Path of the log file to append to.
     * @param options.level - Most verbose level written to the file; defaults to `debug`.
     */
    public constructor(options: { filename: string; level?: LogLevel }) {
        this.level = options.level ?? 'debug';
        fs.mkdirSync(path.dirname(options.filename), { recursive: true });
        this.stream = fs.createWriteStream(options.filename, { flags: 'a' });
    }

    public log(record: LogRecord): void {
        if (!isAtLeastLevel(record.level, this.level)) return;

        const namespace = record.namespace ? ` [${record.namespace}]` : '';
        const line = `[${record.timestamp}] [${record.level.toUpperCase()}]${namespace}: ${record.message}`;
        this.stream.write(`${line.replaceAll(ANSI_PATTERN, '').replaceAll(/§[\da-fk-or]/g, '')}\n`);
    }

    public close(): void {
        this.stream.end();
    }
}
