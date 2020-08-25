const glob = require('glob')
const path = require('path')
const fs = require('fs')

const Prismarine = require('./src/prismarine')
const logger = require('./src/utils/logger')

'use strict'

// TODO: read config

const server = new Prismarine(logger)

// Create folders
if (!(fs.existsSync(__dirname + '/plugins'))) {
    fs.mkdirSync(__dirname + '/plugins')
}
if (!(fs.existsSync(__dirname + '/worlds'))) {
    fs.mkdirSync(__dirname + '/worlds')
}

// Load all plugins
glob.sync('./plugins/*.js').map(
    file => server.loadPlugin(file)
)

server.listen()

