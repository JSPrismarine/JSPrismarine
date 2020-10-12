import fs from 'fs';
import readline from 'readline';
import path from 'path';

import Config from './utils/config';

const serverConfig = new Config(path.join(process.cwd(), 'config.yaml'));
(global as any).log_level = serverConfig.get('log-level', 'info');

import Prismarine from './prismarine';
import ConsoleSender from './utils/ConsoleSender';
import * as Logger from './utils/Logger';

const server = new Prismarine({
    logger: Logger,
    config: serverConfig,
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
            generator: 'overworld',
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
        Logger.warn(
            `Error while loading plugin §b${folderName}§r: §c${error}`
        );
    }
}

// Console command reader
let rl = readline.createInterface({ input: process.stdin });
rl.on('line', (input: string) => {
    if (typeof input !== 'string') {
        return Logger.warn('Got an invalid command!');
    }

    if (!(input.startsWith('/'))) {
        input = `/${input.toLowerCase()}`;
    }

    return (server.getCommandManager() as any).dispatchCommand(
        new ConsoleSender(server), input
    );
});


server.listen(serverConfig.get('port', 19132)).catch(() => {
    Logger.error(`Cannot start the server, is it already running on the same port?`);
    process.exit(1);
});

// Kills the server when exiting process
let exitEvents = ['SIGINT', 'SIGUSR1', 'SIGUSR2', 'SIGTERM'];
for (let event of exitEvents) {
    process.on(event, () => {
        server.kill();
    });
}

module.exports = server;
