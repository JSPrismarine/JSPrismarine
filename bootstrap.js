const Prismarine = require('./src/prismarine')
const logger = require('./src/utils/logger')

'use strict'

// TODO: read config
const server = new Prismarine(logger)
server.listen()
