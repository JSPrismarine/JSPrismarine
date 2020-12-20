import { Logger } from 'winston';
import util from 'util';

const { createLogger, format, transports } = require('winston');
const { combine, timestamp, printf } = format;
const mcColors = require('mccolorstoconsole');

export default class LoggerBuilder {
    private logger: Logger;

    constructor() {
        this.logger = createLogger({
            transports: [
                new transports.Console({
                    level:
                        /*process.env.NODE_ENV !== 'development' &&*/ (global as any)
                            .log_level || 'info', //|| 'silly',
                    format: combine(
                        timestamp({ format: 'HH:mm:ss' }),
                        format.colorize(),
                        format.simple(),
                        printf(({ level, message, timestamp }: any) => {
                            return `[${timestamp}] [${level.padStart(
                                15
                            )}]: ${mcColors.minecraftToConsole(message)}`;
                        })
                    )
                }),
                new transports.File({
                    level: 'silly',
                    filename: process.cwd() + '/jsprismarine.log',
                    format: combine(
                        timestamp({ format: 'HH:mm:ss' }),
                        format.simple(),
                        printf(({ level, message, timestamp }: any) => {
                            return `[${timestamp}] ${level}: ${mcColors
                                .minecraftToConsole(message)
                                .replace(
                                    /[\u001b\u009b][[()#;?]*(?:[0-9]{1,4}(?:;[0-9]{0,4})*)?[0-9A-ORZcf-nqry=><]/g,
                                    ''
                                )}`; // eslint-disable-line
                        })
                    )
                })
            ]
        });
    }

    /**
     * Log information messages
     * @param message
     */
    public info = (message: string, ...param: any[]) => {
        this.logger.log(
            'info',
            param.length > 1 ? util.format(message, param) : message
        );
    };

    /**
     * Log warning messages
     * @param message
     */
    public warn = (message: string, ...param: any[]) => {
        this.logger.log(
            'warn',
            param.length > 1 ? util.format(message, param) : message
        );
    };

    /**
     * Log error messages
     * @param message
     */
    public error = (message: string, ...param: any[]) => {
        this.logger.log(
            'error',
            param.length > 1 ? util.format(message, param) : message
        );
    };

    /**
     * Log debug messages
     * @param message
     */
    public debug = (message: string, ...param: any[]) => {
        this.logger.log(
            'debug',
            param.length > 1 ? util.format(message, param) : message
        );
    };

    /**
     * Log silly messages
     * @param message
     */
    public silly = (message: string, ...param: any[]) => {
        this.logger.log(
            'silly',
            param.length > 1 ? util.format(message, param) : message
        );
    };
}
