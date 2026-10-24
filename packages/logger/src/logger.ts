import colorParser from '@jsprismarine/color-parser';

import type { ConsoleLike, LogTransport } from './transport';
import { PrismarineTransport } from './transport';

/**
 * A log level.
 * @type {LogLevel}
 * @public
 */
export type LogLevel = 'error' | 'warn' | 'info' | 'verbose' | 'debug' | 'silly';

const LEVEL_WEIGHT: Record<LogLevel, number> = { error: 0, warn: 1, info: 2, verbose: 3, debug: 4, silly: 5 };

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
 * Helper class for general logging.
 * @document ../../../docs/log-levels.md
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
        return !this.closed && LEVEL_WEIGHT[level] <= LEVEL_WEIGHT[this.level];
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
    private getNamespace = () => {
        const stack = new Error().stack?.replaceAll('\\', '/');
        if (!stack) return '';

        const caller = (stack.split('\n')[3] || '').trim();
        if (!caller) return '';

        // Get path inside of the parentheses in the caller string, excluding the line:col.
        const file = caller.match(/\(([^)]+)\)/)?.[1]?.split('src/')[1] || '';
        if (!file) return '';

        // Get path and line:col from the file string, then remove the file extension.
        const path = file.split(':').slice(0, -2).join(':').slice(0, -3);
        if (!path) return '';

        const lineCol = file.split(':').slice(-2).join(':');
        if (!lineCol) return '';

        if (this.level === 'silly' || this.level === 'debug' || this.level === 'verbose') {
            return `${path}.ts:${lineCol}`;
        }

        return path.split('/').at(-1) || '';
    };

    /**
     * @private
     * @internal
     */
    private parseMessage = (input: string[]) => {
        const output = input.join('§r ');

        // Make sure log messages end with a period.
        if (['.', '!', '?'].includes(output.charAt(-1))) {
            return `${output}.`;
        }

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
