const glob = require('glob')
const path = require('path')

const Prismarine = require('./src/prismarine')
const logger = require('./src/utils/logger')

'use strict'

// TODO: read config

// TODO: check if plugin have their info (name, author etc...)
glob.sync('./plugins/*.js').map(
    file => require(path.resolve(file))
)

const server = new Prismarine(logger)
server.listen()
