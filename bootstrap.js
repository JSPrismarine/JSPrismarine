const fs = require('fs')
const readline = require('readline')
const path = require('path')

const Config = require('./src/utils/config')
const Prismarine = require('./src/prismarine')
const logger = require('./src/utils/logger')
const ConsoleSender = require('./src/command/console-sender')

'use strict'

const serverConfig = new Config(path.join(process.cwd(), 'config.yaml'))
const server = new Prismarine({
    logger, config: serverConfig,
})

// Create folders
if (!(fs.existsSync(process.cwd() + '/plugins'))) {
    fs.mkdirSync(process.cwd() + '/plugins')
}
if (!(fs.existsSync(process.cwd() + '/worlds'))) {
    fs.mkdirSync(process.cwd() + '/worlds')
}

// Load default level
server.getWorldManager().loadWorld(
    serverConfig.get('worlds.overworld.name', 'world')
)

// Load all plugins
let pluginFolders = fs.readdirSync(process.cwd() + '/plugins')
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
        input = `/${input.toLowerCase()}`
    }

    server.getCommandManager().dispatchCommand(
        new ConsoleSender(server), input
    )
})

// Kills the server when exiting process
let exitEvents = ['SIGINT', 'SIGUSR1', 'SIGUSR2', 'SIGTERM']
for (let event of exitEvents) {
    process.on(event, () => {
        server.kill()
    })
}

server.listen(serverConfig.get('port', 19132)).catch(() => {
    logger.error(`Cannot start the server, is it already running on the same port?`)
    process.exit(1)
})
