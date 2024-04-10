import type { Logger } from 'winston';
import { createLogger, format, transports } from 'winston';
import Transport from 'winston-transport';
import colorParser from '@jsprismarine/color-parser';

import fs from 'node:fs';
import path from 'node:path';

import { cwd } from './cwd';
import type Console from '../Console';

const { combine, timestamp, printf } = format;

class PrismarineTransport extends Transport {
    public console: Console | undefined;
    private buffer: any[] = [];

    log(info: any, next: () => void) {
        if (!this.console) {
            this.buffer.push(info);
            return next();
        }

        if (this.buffer.length > 0) {
            for (const message of this.buffer) {
                this.console.write(message[Symbol.for('message')]);
            }
            this.buffer = [];
        }

        this.console.write(info[Symbol.for('message')]);
        return next();
    }
}

export default class LoggerBuilder {
    public static logFile: string;
    private logger!: Logger;

    public constructor() {
        const date = new Date();
        if (!LoggerBuilder.logFile && process.env.NODE_ENV === 'development')
            LoggerBuilder.logFile = 'jsprismarine-development.log';
        else if (!LoggerBuilder.logFile)
            // mmddyyyy-hh-mm-ss. yes American-style, sue me.
            LoggerBuilder.logFile = `jsprismarine.${(date.getMonth() + 1).toString().padStart(2, '0')}${date
                .getDate()
                .toString()
                .padStart(2, '0')}${date.getFullYear().toString().padStart(2, '0')}-${date
                .getHours()
                .toString()
                .padStart(2, '0')}${date.getMinutes().toString().padStart(2, '0')}${date
                .getSeconds()
                .toString()
                .padStart(2, '0')}.log`;

        this.createLogger();
    }

    /**
     * Create a new logger instance
     *
     * @returns {void}
     */
    public createLogger() {
        // If the logger is already created and not closed, return.
        if ((this.logger as any) && !this.logger.closed) return;

        this.logger = createLogger({
            level: global.logLevel ?? 'info',
            format: combine(
                timestamp({ format: 'HH:mm:ss' }),
                format((info) => {
                    info.level = info.level.toUpperCase();
                    return info;
                })(),
                format.colorize(),
                format.simple()
            ),
            transports: [
                new PrismarineTransport({
                    format: combine(
                        printf(({ level, message, timestamp, namespace: ns }) => {
                            const prefix = `${timestamp} ${level} ${ns}`;

                            return colorParser(`[${prefix}§r]: ${message}§r`);
                        })
                    )
                }),
                new transports.File({
                    level: 'debug',
                    filename: path.join(cwd(), 'logs', `${LoggerBuilder.logFile}`),
                    format: combine(
                        printf(({ level, message, timestamp, namespace }: any) => {
                            return `[${timestamp}] [${level}]${colorParser(
                                `${namespace ? ` [${namespace}]` : ''}: ${message}`
                            )}`.replaceAll(
                                /[\u001b\u009b][[()#;?]*(?:[0-9]{1,4}(?:;[0-9]{0,4})*)?[0-9A-ORZcf-nqry=><]/g,
                                ''
                            );
                        })
                    )
                })
            ]
        });
    }

    public onLine(listener: (line: string) => void): void {
        this.logger.on('data', (data) => listener(data.message.toString()));
    }
    public setConsole(console: Console) {
        (this.logger.transports[0] as PrismarineTransport).console = console;
    }

    public async onEnable(): Promise<void> {
        this.createLogger();
        this.logger.level = global.logLevel ?? 'info';
    }

    public async onDisable(): Promise<void> {
        // TODO: Fix this
        //this.logger.close();
        //this.logger.destroy();
    }

    public getLog(): string | undefined {
        try {
            return fs.readFileSync(path.join(cwd(), 'logs', LoggerBuilder.logFile), 'utf-8');
        } catch {
            return undefined;
        }
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
