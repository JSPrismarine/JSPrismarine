import colorParser from '@jsprismarine/color-parser';

import type { LogLevel } from './levels';
import { isAtLeastLevel } from './levels';
import type { ConsoleLike, LogTransport } from './transport';
import { PrismarineTransport } from './transport';

/** ANSI open sequence per level, mirroring the palette winston used to apply. */
const LEVEL_COLOR: Record<LogLevel, string> = {
    error: '\u001b[31m',
    warn: '\u001b[33m',
    info: '\u001b[32m',
    verbose: '\u001b[36m',
    debug: '\u001b[34m',
    silly: '\u001b[35m'
};

/**
 * Parse V8's trailing `:line:column` without backtracking across a caller-controlled stack frame.
 * @param {string} frame - One trimmed or untrimmed stack frame.
 * @returns {[string, string, string] | undefined} The file, line, and column, if present.
 */
const locationFromFrame = (frame: string): [string, string, string] | undefined => {
    const locationAtEnd = (location: string): [string, string, string] | undefined => {
        const columnSeparator = location.lastIndexOf(':');
        const lineSeparator = location.lastIndexOf(':', columnSeparator - 1);
        if (lineSeparator <= 0 || columnSeparator <= lineSeparator) return undefined;

        const line = location.slice(lineSeparator + 1, columnSeparator);
        const column = location.slice(columnSeparator + 1);
        if (!line || !column) return undefined;
        for (const digit of line) if (digit < '0' || digit > '9') return undefined;
        for (const digit of column) if (digit < '0' || digit > '9') return undefined;

        return [location.slice(0, lineSeparator), line, column];
    };

    const caller = frame.trim();
    if (caller.endsWith(')')) {
        const openParenthesis = caller.lastIndexOf('(');
        if (openParenthesis >= 0) {
            const location = locationAtEnd(caller.slice(openParenthesis + 1, -1));
            if (location) return location;
        }
    }

    // Node also prints native frames without parentheses: `at file.js:line:column`.
    return caller.startsWith('at ') ? locationAtEnd(caller.slice(3).trim()) : undefined;
};

/**
 * Helper class for general logging.
 * @document ../../../docs/guide/log-levels.md
 * @class
 * @public
 */
export class Logger {
    private readonly level: LogLevel;
    private readonly consoleTransport = new PrismarineTransport();
    private readonly transports: LogTransport[];
    private readonly lineListeners: Array<(line: string) => void> = [];
    private closed = false;

    /**
     * Create a new logger instance
     * @param {LogLevel} level - The log level to use.
     * @param {LogTransport[]} transports - Transports to write to besides the console.
     * @returns {Logger} The logger instance.
     */
    public constructor(level: LogLevel = 'info', transports: LogTransport[] = []) {
        this.level = level;
        this.transports = [this.consoleTransport, ...transports];
    }

    /**
     * On enable hook.
     * @group Lifecycle
     */
    public async enable(): Promise<void> {
        this.closed = false;
    }

    /**
     * On disable hook.
     * @group Lifecycle
     */
    public async disable(): Promise<void> {
        this.closed = true;
        for (const transport of this.transports) {
            transport.close?.();
        }
    }

    /**
     * Listen for log messages.
     * @param {(line: string) => void} listener - The listener to call when a log message is received.
     * @event
     */
    public onLine(listener: (line: string) => void): void {
        this.lineListeners.push(listener);
    }

    /**
     * Set the console instance to use.
     * @param {ConsoleLike} console - The console instance to use.
     */
    public setConsole(console?: ConsoleLike): void {
        if (!console) return;
        this.consoleTransport.console = console;
    }

    private isLevelEnabled(level: LogLevel): boolean {
        return !this.closed && isAtLeastLevel(level, this.level);
    }

    /**
     * Check whether a message at `level` would be written.
     *
     * Call this before formatting expensive messages so suppressed log lines do not allocate
     * strings or argument arrays on hot paths.
     * @param {LogLevel} level - The level the message would use.
     * @returns {boolean} `true` when the logger is open and the level is enabled.
     */
    public isEnabled(level: LogLevel): boolean {
        return this.isLevelEnabled(level);
    }

    private emit(level: LogLevel, message: string, namespace: string): void {
        const now = new Date();
        const timestamp = [now.getHours(), now.getMinutes(), now.getSeconds()]
            .map((part) => part.toString().padStart(2, '0'))
            .join(':');
        const coloredLevel = `${LEVEL_COLOR[level]}${level.toUpperCase()}\u001b[39m`;
        const formatted = colorParser(
            `[${timestamp} ${coloredLevel}${namespace ? ` ${namespace}` : ''}§r]: ${message}§r`
        );

        for (const transport of this.transports) {
            transport.log({ level, message, namespace, timestamp, formatted });
        }
        for (const listener of this.lineListeners) {
            listener(message);
        }
    }

    /**
     * Get callee's namespace from the stack trace.
     *
     * Capturing a stack costs ~15 us, so every log method checks the level *before*
     * calling this - the message would otherwise be dropped only after we had paid for
     * it. That guard has to stay inline in each method: this reads frame 3, the caller of
     * the log method, and any helper wrapped around the call would shift it.
     * @private
     * @internal
     */
    private getNamespace = (stack = new Error().stack) => {
        if (!stack) return '';

        const caller = (stack.split('\n')[3] || '').trim();
        if (!caller) return '';

        // Stack text can include library-controlled input; parse coordinates without backtracking regexes.
        const location = locationFromFrame(caller);
        if (!location) return '';

        const [rawFile, line, column] = location;
        const normalizedFile = rawFile?.replaceAll('\\', '/') ?? '';
        const moduleFile =
            normalizedFile.match(/\/(?:src|dist)\/(.+)$/u)?.[1] ?? normalizedFile.split('/').at(-1) ?? '';
        if (!moduleFile) return '';

        const extension = moduleFile.match(/\.(?:[cm]?[jt]s|tsx|jsx)$/u)?.[0] ?? '';
        const modulePath = extension ? moduleFile.slice(0, -extension.length) : moduleFile;
        if (!modulePath) return '';

        if (this.level === 'silly' || this.level === 'debug' || this.level === 'verbose') {
            return `${modulePath}${extension}:${line}:${column}`;
        }

        return modulePath.split('/').at(-1) || '';
    };

    /**
     * @private
     * @internal
     */
    private parseMessage = (input: string[]) => {
        const output = input.join('§r ');

        // Make sure log messages end with a period.
        const lastCharacter = output.at(-1);
        if (output && lastCharacter !== '.' && lastCharacter !== '!' && lastCharacter !== '?') return `${output}.`;

        return output;
    };

    /**
     * Log information messages.
     * @param {...string} message - The message to log.
     */
    public info = (...message: string[]): void => {
        // Guard inline; see getNamespace() for why it must not move into a helper.
        if (!this.isLevelEnabled('info')) return;

        this.emit('info', this.parseMessage(message), this.getNamespace());
    };

    /**
     * Log warning messages.
     * @param {...string} message - The message to log.
     */
    public warn = (...message: string[]): void => {
        // Guard inline; see getNamespace() for why it must not move into a helper.
        if (!this.isLevelEnabled('warn')) return;

        this.emit('warn', this.parseMessage(message), this.getNamespace());
    };

    /**
     * Log error messages.
     * @param {string | Error | any} message - The message to log.
     */
    public error = (message: string | Error | any): void => {
        if (!this.isLevelEnabled('error')) return;

        if (typeof message === 'string') {
            this.emit('error', message, this.getNamespace());
            return;
        }

        if (message.stack) {
            this.emit(
                'error',
                `${message.stack.split('\n')[0] !== message.toString() ? `${message.toString()}\n` : ''}${message.stack}`,
                ''
            );
            return;
        }

        this.emit('error', message.toString(), '');
    };

    /**
     * Log verbose messages.
     * @param {...string} message - The message to log.
     */
    public verbose = (...message: string[]): void => {
        // Guard inline; see getNamespace() for why it must not move into a helper.
        if (!this.isLevelEnabled('verbose')) return;

        this.emit('verbose', this.parseMessage(message), this.getNamespace());
    };

    /**
     * Log debug messages.
     * @param {...string} message - The message to log.
     */
    public debug = (...message: string[]): void => {
        // Guard inline; see getNamespace() for why it must not move into a helper.
        if (!this.isLevelEnabled('debug')) return;

        this.emit('debug', this.parseMessage(message), this.getNamespace());
    };

    /**
     * Log silly messages.
     * @param {...string} message - The message to log.
     */
    public silly = (...message: string[]): void => {
        // Guard inline; see getNamespace() for why it must not move into a helper.
        if (!this.isLevelEnabled('silly')) return;

        this.emit('silly', this.parseMessage(message), this.getNamespace());
    };
}
