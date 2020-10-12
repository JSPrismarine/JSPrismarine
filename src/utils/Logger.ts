const { createLogger, format, transports } = require('winston');
const { combine, timestamp, printf } = format;
const mcColors = require("mccolorstoconsole");

// Construct a new logger instance
let logger = createLogger({
    transports: [
        new transports.Console({
            level: process.env.NODE_ENV !== 'development' && ((global as any).log_level || 'info') || 'silly',
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

/**
 * Log debugging messages
 * @param {string} message 
 */
const debug = (message: string) => {
    logger.log('debug', message);
}

/**
 * Log information messages
 * @param {string} message 
 */
const info = (message: string) => {
    logger.log('info', message);
}

/**
 * Log warning messages
 * @param {string} message 
 */
const warn = (message: string) => {
    logger.log('warn', message);
}

/**
 * Log error messages
 * @param {string} message 
 */
const error = (message: string) => {
    logger.log('error', message);
}

/**
 * Log silly messages
 * @param {string} message 
 */
const silly = (message: string) => {
    logger.log('silly', message);
}

export {
    debug,
    info,
    warn,
    error,
    silly
}
