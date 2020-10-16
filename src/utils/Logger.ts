import type { Logger } from "winston";

import { createLogger, format, transports } from 'winston';
const { combine, timestamp, printf } = format;
// Todo refactor and type
const mcColors = require("mccolorstoconsole");

export default class LoggerBuilder {
    private logger: Logger;

    constructor() {
        this.logger = createLogger({
            transports: [
                new transports.Console({
                    level: /*process.env.NODE_ENV !== 'development' &&*/ ((global as any).log_level || 'info'), //|| 'silly',
                    format: combine(
                        timestamp({ format: 'HH:mm:ss' }),
                        format.colorize(),
                        format.simple(),
                        printf(({ level, message, timestamp }: any) => {
                            return `[${timestamp}] ${level}: ${mcColors.minecraftToConsole(message)}`;
                        })
                    ),
                }),
                new (transports.File)({
                    level: 'silly',
                    filename: process.cwd() + '/jsprismarine.log',
                    format: combine(
                        timestamp({ format: 'HH:mm:ss' }),
                        format.simple(),
                        printf(({ level, message, timestamp }: any) => {
                            return `[${timestamp}] ${level}: ${mcColors.minecraftToConsole(message).replace(
                                /[\u001b\u009b][[()#;?]*(?:[0-9]{1,4}(?:;[0-9]{0,4})*)?[0-9A-ORZcf-nqry=><]/g, '')}` // eslint-disable-line
                        })
                    )
                })
            ]
        });
    }

    /**
     * Log information messages
     * @param {string} message 
     */
    public info = (message: string) => {
        this.logger.log('info', message);
    }

    /**
     * Log warning messages
     * @param {string} message 
     */
    public warn = (message: string) => {
        this.logger.log('warn', message);
    }

    /**
     * Log error messages
     * @param {string} message 
     */
    public error = (message: string) => {
        this.logger.log('error', message);
    }

    /**
     * Log debug messages
     * @param {string} message 
     */
    public debug = (message: string) => {
        this.logger.log('debug', message);
    }

    /**
     * Log silly messages
     * @param {string} message 
     */
    public silly = (message: string) => {
        this.logger.log('silly', message);
    }
};
