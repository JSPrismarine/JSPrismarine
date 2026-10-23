import fs from 'node:fs';
import path from 'node:path';
import type { LogLevel } from './logger';

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

/**
 * Transport for the interactive JSPrismarine console. Records are buffered
 * until a console attaches, then replayed in order, so nothing logged during
 * boot is lost.
 */
export class PrismarineTransport implements LogTransport {
    public console: ConsoleLike | undefined;
    private buffer: LogRecord[] = [];

    public log(record: LogRecord): void {
        if (!this.console) {
            this.buffer.push(record);
            return;
        }

        try {
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

const LEVEL_WEIGHT: Record<LogLevel, number> = { error: 0, warn: 1, info: 2, verbose: 3, debug: 4, silly: 5 };

// eslint-disable-next-line no-control-regex -- matches the ANSI escapes being stripped
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
        if (LEVEL_WEIGHT[record.level] > LEVEL_WEIGHT[this.level]) return;

        const namespace = record.namespace ? ` [${record.namespace}]` : '';
        const line = `[${record.timestamp}] [${record.level.toUpperCase()}]${namespace}: ${record.message}`;
        this.stream.write(`${line.replaceAll(ANSI_PATTERN, '').replaceAll(/§[\da-fk-or]/g, '')}\n`);
    }

    public close(): void {
        this.stream.end();
    }
}
