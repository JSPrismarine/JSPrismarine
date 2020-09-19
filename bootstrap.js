const fs = require('fs')
const readline = require('readline')
const path = require("path");

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

// Load default level
server.getWorldManager().loadWorld(
    server.getConfig().get('worlds.normal.name', 'world')
)

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
let pluginFolderNames = fs.readdirSync('./plugins')
for (let i = 0; i < pluginFolderNames.length; i++) {
    const folderName = pluginFolderNames[i];
    try {
        server.logger.info(`§8${folderName}§r named plugin is loading..`)
        let plugin = server.getPluginManager().loadPluginFolder(
            path.resolve('./plugins', folderName)
        )
        server.logger.info(
            `§e${plugin.manifest.name}§r §8(${folderName})§r named plugin is loaded!`
        )
    } catch (error) {
        server.logger.warn(
            `§e${folderName}§r named plugin could not be loaded due to §c${error}§r.`
        )
    }
}

server.listen(server.getConfig().get("server.port",19132))

