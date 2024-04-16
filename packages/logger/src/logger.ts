import colorParser from '@jsprismarine/color-parser';

import type { Logger as Winston } from 'winston';
import { createLogger, format } from 'winston';

import type TransportStream from 'winston-transport';
import type { ConsoleLike } from './transport';
import { PrismarineTransport } from './transport';

export type LogLevel = 'error' | 'warn' | 'info' | 'verbose' | 'debug' | 'silly';

export class Logger {
    public static logFile: string;
    private logger!: Winston;

    public constructor(level: LogLevel = 'info', transports: TransportStream[] = []) {
        this.createLogger(level, transports);
    }

    /**
     * Create a new logger instance
     *
     * @returns {void}
     */
    protected createLogger(level: LogLevel = 'info', transports: TransportStream[] = []) {
        // If the logger is already created and not closed, return.
        if ((this.logger as any) && !this.logger.closed) return;

        this.logger = createLogger({
            level,
            format: format.combine(
                format.timestamp({ format: 'HH:mm:ss' }),
                format((info) => {
                    info.level = info.level.toUpperCase();
                    return info;
                })(),
                format.colorize(),
                format.simple()
            ),
            transports: [
                new PrismarineTransport({
                    format: format.printf(({ level, message, timestamp, namespace: ns }) => {
                        const prefix = `${timestamp} ${level} ${ns}`;

                        return colorParser(`[${prefix}§r]: ${message}§r`);
                    })
                }),
                ...transports
            ]
        });
    }

    public async enable(): Promise<void> {
        this.createLogger();
    }

    public async disable(): Promise<void> {
        this.logger.close();
        this.logger.destroy();
    }

    public onLine(listener: (line: string) => void): void {
        this.logger.on('data', (data) => listener(data.message.toString()));
    }

    public setConsole(console: ConsoleLike) {
        (this.logger.transports[0] as PrismarineTransport).console = console;
    }

    private getNamespace = () => {
        const stack = (new Error().stack as string).replaceAll('\\', '/');

        const caller = (stack.split('\n')[3] || '').trim();
        if (!caller) return '';

        // Get path inside of the parentheses in the caller string, excluding the line:col.
        const file = caller.match(/\(([^)]+)\)/)?.[1]?.split('src/')[1] || '';
        if (!file) return '';

        // Get path and line:col from the file string, then remove the file extension.
        const path = file.split(':').slice(0, -2).join(':').slice(0, -3);
        const lineCol = file.split(':').slice(-2).join(':');

        if (this.logger.level === 'silly' || this.logger.level === 'debug' || this.logger.level === 'verbose') {
            return `${path}.ts:${lineCol}`;
        }

        return path.split('/').at(-1) || '';
    };

    private parseMessage = (input: string[]) => {
        return input.join('§r ');
    };

    /**
     * Log information messages
     * @param message
     */
    public info = (...message: string[]) => {
        this.logger.log('info', this.parseMessage(message), {
            namespace: this.getNamespace()
        });
    };

    /**
     * Log warning messages
     * @param message
     */
    public warn = (...message: string[]) => {
        this.logger.log('warn', this.parseMessage(message), {
            namespace: this.getNamespace()
        });
    };

    /**
     * Log error messages
     * @param message
     */
    public error = (message: string | Error | any) => {
        if (typeof message === 'string') {
            this.logger.log('error', message, {
                namespace: this.getNamespace()
            });
            return;
        }

        // eslint-disable-next-line no-console
        this.logger.error(message.toString());
        if (message.stack) this.logger.error(message.stack);
    };

    /**
     * Log verbose messages
     * @param message
     */
    public verbose = (...message: string[]) => {
        this.logger.log('verbose', this.parseMessage(message), {
            namespace: this.getNamespace()
        });
    };

    /**
     * Log debug messages
     * @param message
     */
    public debug = (...message: string[]) => {
        this.logger.log('debug', this.parseMessage(message), {
            namespace: this.getNamespace()
        });
    };

    /**
     * Log silly messages
     * @param message
     */
    public silly = (...message: string[]) => {
        this.logger.log('silly', this.parseMessage(message), {
            namespace: this.getNamespace()
        });
    };
}
