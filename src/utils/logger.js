const { createLogger, format, transports } = require('winston')
const { combine, timestamp, printf } = format
const mcColors = require("mccolorstoconsole");

'use strict'

// Construct a new logger instance
let logger = createLogger({
    transports: [
        new transports.Console({
            level: 'silly',
            format: combine(
                timestamp({format: 'HH:mm:ss'}),
                format.colorize(),
                format.simple(),
                printf(({ level, message, timestamp }) => {
                    return `[${timestamp}] ${level}: ${mcColors.minecraftToConsole(message)}`
                })
            ),
        })
    ]
})

module.exports = {
    /**
     * Log debugging messages
     * @param {string} message 
     */
    debug: function(message) {
        logger.log('debug', message)
    },
    /**
     * Log information messages
     * @param {string} message 
     */
    info: function(message) {
        logger.log('info', message)
    },
    /**
     * Log warning messages
     * @param {string} message 
     */
    warn: function(message) {
        logger.log('warn', message)
    },
    /**
     * Log error messages
     * @param {string} message 
     */
    error: function(message) {
        logger.log('error', message)
    },
    /**
     * Log silly messages
     * @param {string} message 
     */
    silly: function(message) {
        logger.log('silly', message)
    }
}