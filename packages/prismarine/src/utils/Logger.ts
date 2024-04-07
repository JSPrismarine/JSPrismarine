import type { Logger } from 'winston';
import { createLogger, format, transports } from 'winston';

import colorParser from '@jsprismarine/color-parser';
import { cwd } from './cwd';
import fs from 'node:fs';
import path from 'node:path';

const { combine, timestamp, printf } = format;

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
            transports: [
                new transports.Console({
                    level: global.logLevel ?? 'info',
                    format: combine(
                        timestamp({ format: 'HH:mm:ss' }),
                        format((info) => {
                            info.level = info.level.toUpperCase();
                            return info;
                        })(),
                        format.colorize(),
                        format.simple(),
                        printf(({ level, message, timestamp, namespace: ns }) => {
                            // TODO: refactor this mess.
                            // TODO: `padEnd` length should depend on `global.logLevel`.
                            const showWholeNs = ns && (global.logLevel === 'silly' || global.logLevel === 'debug');
                            const prefix = `${timestamp} ${level.padEnd(17)} ${showWholeNs ? `${ns}` : `${ns?.split?.('/')[0] || ''}`}`;

                            return `[${prefix}]: ${colorParser(`${message}`)}`;
                        })
                    )
                }),
                new transports.File({
                    level: 'debug',
                    filename: path.join(cwd(), 'logs', `${LoggerBuilder.logFile}`),
                    format: combine(
                        timestamp({ format: 'HH:mm:ss.SS' }),
                        format.simple(),
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
        const caller = (new Error().stack as string).split('\n')[3]!.split('at ')[1]!;
        const callerName = caller.split(' ')[0]?.split('.').join('/');
        const callerFile = caller.split(' ')[1]?.slice(1, -1).split('/').at(-1);
        return `${callerName} (${callerFile})`;
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
        console.error(message as Error);
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
