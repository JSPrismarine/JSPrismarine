import { Logger } from 'winston';
import util from 'util';

const { createLogger, format, transports } = require('winston');
const { combine, timestamp, printf } = format;
const mcColors = require('mccolorstoconsole');

export default class LoggerBuilder {
    private readonly logger: Logger;

    constructor() {
        this.logger = createLogger({
            transports: [
                new transports.Console({
                    level:
                        /* Process.env.NODE_ENV !== 'development' && */ (global as any)
                            .log_level || 'info', // || 'silly',
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
                                    /[\u001B\u009B][[()#;?]*(?:\d{1,4}(?:;\d{0,4})*)?[\dA-ORZcf-nqry=><]/g,
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
    public info = (message: string, ...parameter: any[]) => {
        this.logger.log(
            'info',
            parameter.length > 1 ? util.format(message, parameter) : message
        );
    };

    /**
     * Log warning messages
     * @param message
     */
    public warn = (message: string, ...parameter: any[]) => {
        this.logger.log(
            'warn',
            parameter.length > 1 ? util.format(message, parameter) : message
        );
    };

    /**
     * Log error messages
     * @param message
     */
    public error = (message: string, ...parameter: any[]) => {
        this.logger.log(
            'error',
            parameter.length > 1 ? util.format(message, parameter) : message
        );
    };

    /**
     * Log debug messages
     * @param message
     */
    public debug = (message: string, ...parameter: any[]) => {
        this.logger.log(
            'debug',
            parameter.length > 1 ? util.format(message, parameter) : message
        );
    };

    /**
     * Log silly messages
     * @param message
     */
    public silly = (message: string, ...parameter: any[]) => {
        this.logger.log(
            'silly',
            parameter.length > 1 ? util.format(message, parameter) : message
        );
    };
}
