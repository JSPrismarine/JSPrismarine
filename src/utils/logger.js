const { createLogger, format, transports } = require('winston')
const { combine, timestamp, printf } = format
const mcColors = require("mccolorstoconsole")

'use strict'

// Construct a new logger instance
let logger = createLogger({
    transports: [
        new transports.Console({
            level: process.env.NODE_ENV !== 'development' && 'info' || 'silly',
            format: combine(
                timestamp({ format: 'HH:mm:ss' }),
                format.colorize(),
                format.simple(),
                printf(({ level, message, timestamp }) => {
                    return `[${timestamp}] ${level}: ${mcColors.minecraftToConsole(message)}`
                })
            ),
        }),
        new (transports.File)({
            level: 'silly',
            filename: process.cwd() + '/jsprismarine.log',
            format: combine(
                timestamp({ format: 'HH:mm:ss' }),
                format.simple(),
                printf(({ level, message, timestamp }) => {
                    return `[${timestamp}] ${level}: ${mcColors.minecraftToConsole(message).replace(
                        /[\u001b\u009b][[()#;?]*(?:[0-9]{1,4}(?:;[0-9]{0,4})*)?[0-9A-ORZcf-nqry=><]/g, '')}` // eslint-disable-line
                })
            )
        })
    ]
})

module.exports = {
    /**
     * Log debugging messages
     * @param {string} message 
     */
    debug: function (message) {
        logger.log('debug', message)
    },
    /**
     * Log information messages
     * @param {string} message 
     */
    info: function (message) {
        logger.log('info', message)
    },
    /**
     * Log warning messages
     * @param {string} message 
     */
    warn: function (message) {
        logger.log('warn', message)
    },
    /**
     * Log error messages
     * @param {string} message 
     */
    error: function (message) {
        logger.log('error', message)
    },
    /**
     * Log silly messages
     * @param {string} message 
     */
    silly: function (message) {
        logger.log('silly', message)
    }
}
