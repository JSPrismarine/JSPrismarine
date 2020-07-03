const { createLogger, format, transports } = require('winston')
const { combine, timestamp, label, printf, prettyPrint } = format

const Prismarine = require('./prismarine')

'use strict'

// Construct a new logger
let logger = createLogger({
    transports: [
        new transports.Console({
            format: combine(
                timestamp({format: 'HH:mm:ss'}),
                format.colorize(),
                format.simple(),
                printf(({ level, message, timestamp }) => {
                    return `[${timestamp}] ${level}: ${message}`;
                })
            ),
        })
    ]
})

// TODO: read config
const server = new Prismarine(logger)
server.listen()
