const winston = require('winston')

const Prismarine = require('./prismarine')

'use strict'

// Construct a new logger
let logger = winston.createLogger({
    transports: [
        new winston.transports.Console({
            format: winston.format.combine(
                winston.format.colorize(),
                winston.format.simple()
            ),
        })
    ]
})
logger.log({level: 'info', message: 'test'})
const server = new Prismarine()
server.listen()
