import fs from 'fs'
import readline from 'readline'
import path from 'path'

import Prismarine from './prismarine'
import logger from './utils/logger'
import ConsoleSender from './command/console-sender'

'use strict'

// TODO: read config

const server = new Prismarine(logger)

// Create folders
if (!(fs.existsSync(`${__dirname}/../plugins`))) {
    fs.mkdirSync(`${__dirname}/../plugins`)
}
if (!(fs.existsSync(`${__dirname}/../worlds`))) {
    fs.mkdirSync(`${__dirname}/../worlds`)
}

// Load default level
// TODO: get its name from a config
server.getWorldManager().loadWorld('world')

// Load all plugins
let pluginFolders = fs.readdirSync(`${__dirname}/../plugins`)
for (let i = 0; i < pluginFolders.length; i++) {
    const folderName = pluginFolders[i]
    try {
        server.getPluginManager().loadPlugin(
            path.resolve('../plugins', folderName)
        )
    } catch (error) {
        logger.warn(
            `Error while loading plugin §b${folderName}§r: §c${error}`
        )
    }
}

// Console command reader
let rl = readline.createInterface({ input: process.stdin })
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
