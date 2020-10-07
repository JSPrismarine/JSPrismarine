'use strict';
const fs = require('fs');
const readline = require('readline');
const path = require('path');

const Config = require('./src/utils/config');

const serverConfig = new Config(path.join(process.cwd(), 'config.yaml'));
global.log_level = serverConfig.get('log-level', 'info');

const Prismarine = require('./src/prismarine');
const ConsoleSender = require('./src/command/console-sender');
const logger = require('./src/utils/logger');

const server = new Prismarine({
    logger, config: serverConfig,
});

// Create folders
if (!(fs.existsSync(process.cwd() + '/plugins'))) {
    fs.mkdirSync(process.cwd() + '/plugins');
}
if (!(fs.existsSync(process.cwd() + '/worlds'))) {
    fs.mkdirSync(process.cwd() + '/worlds');
}

// Load default level
const defaultWorld = serverConfig.get('level-name', 'world');
server.getWorldManager().loadWorld(
    serverConfig.get('worlds', {
        world: {
            generator: 'flat',
            seed: 1234 // TODO: generate random seed
        }
    })[defaultWorld],
    defaultWorld
);

// Load all plugins
let pluginFolders = fs.readdirSync(process.cwd() + '/plugins');
for (let i = 0; i < pluginFolders.length; i++) {
    const folderName = pluginFolders[i];
    try {
        server.getPluginManager().loadPlugin(
            path.resolve('./plugins', folderName)
        );
    } catch (error) {
        logger.warn(
            `Error while loading plugin §b${folderName}§r: §c${error}`
        );
    }
}

// Console command reader
let rl = readline.createInterface({ input: process.stdin });
rl.on('line', (input) => {
    if (typeof input !== 'string') {
        return logger.warn('Got an invalid command!');
    }

    if (!(input.startsWith('/'))) {
        input = `/${input.toLowerCase()}`;
    }

    return server.getCommandManager().dispatchCommand(
        new ConsoleSender(server), input
    );
});

// Kills the server when exiting process
let exitEvents = ['SIGINT', 'SIGUSR1', 'SIGUSR2', 'SIGTERM'];
for (let event of exitEvents) {
    process.on(event, () => {
        server.kill();
    });
}

server.listen(serverConfig.get('port', 19132)).catch(() => {
    logger.error(`Cannot start the server, is it already running on the same port?`);
    process.exit(1);
});
