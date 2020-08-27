const glob = require('glob')
const path = require('path')
const fs = require('fs')
const readline = require('readline')

const Prismarine = require('./src/prismarine')
const logger = require('./src/utils/logger')
const ConsoleSender = require('./src/command/console-sender')

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

// Console command reader
let rl = readline.createInterface({input: process.stdin})
rl.on('line', (input) => {
    if (typeof input !== 'string') {
        return logger.warn('Got an invalid command!')
    }

    if (!(input.startsWith('/'))) {
        input = `/${input}`
    }

    server.getCommandManager().dispatchCommand(
        new ConsoleSender(server), input
    )
})

// Load all plugins
glob.sync('./plugins/*.js').map(
    file => server.loadPlugin(file)
)

server.listen()

