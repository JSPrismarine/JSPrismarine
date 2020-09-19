const fs = require('fs')
const readline = require('readline')
const path = require('path')

const Prismarine = require('./src/prismarine')
const logger = require('./src/utils/logger')
const ConsoleSender = require('./src/command/console-sender')
const PaletteManager = require('./src/world/palette-manager')

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

// Load default level
// TODO: get its name from a config
server.getWorldManager().loadWorld('world')

// Init block states
PaletteManager.init()

// Load all plugins
let pluginFolders = fs.readdirSync('./plugins')
for (let i = 0; i < pluginFolders.length; i++) {
    const folderName = pluginFolders[i]
    try {
        server.getPluginManager().loadPlugin(
            path.resolve('./plugins', folderName)
        )
    } catch (error) {
        logger.warn(
            `Error while loading plugin §b${folderName}§r: §c${error}`
        )
    }
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

server.listen().catch(() => 
    logger.error(`Cannot start the server, is it already running on the same port?`)
)