import fs from 'fs';
import readline from 'readline';
import path from 'path';

import Prismarine from './Prismarine';
import ConsoleSender from './utils/ConsoleSender';
import ConfigBuilder from './config';
import LoggerBuilder from './utils/Logger';
import pkg from '../package.json';
import Identifiers from './network/identifiers';

const Config = new ConfigBuilder();
const Logger = new LoggerBuilder();

Logger.info(`Starting JSPrismarine server version ${pkg.version} for Minecraft: Bedrock Edition v${Identifiers.MinecraftVersion} (protocol version ${Identifiers.Protocol})`)
const Server = new Prismarine({
    config: Config,
    logger: Logger,
});

// Create folders
if (!(fs.existsSync(process.cwd() + '/plugins'))) {
    fs.mkdirSync(process.cwd() + '/plugins');
}
if (!(fs.existsSync(process.cwd() + '/worlds'))) {
    fs.mkdirSync(process.cwd() + '/worlds');
}

// Load default level
const defaultWorld = Server.getConfig().getLevelName();
Server.getWorldManager().loadWorld(
    Server.getConfig().getWorlds()[defaultWorld],
    defaultWorld
);

// Load all plugins
let pluginFolders = fs.readdirSync(process.cwd() + '/plugins');
for (let i = 0; i < pluginFolders.length; i++) {
    const folderName = pluginFolders[i];
    try {
        Server.getPluginManager().loadPlugin(
            path.resolve('./plugins', folderName)
        );
    } catch (error) {
        Server.getLogger().warn(
            `Error while loading plugin §b${folderName}§r: §c${error}`
        );
    }
}

// Console command reader
process.stdin.setEncoding('utf8');
let rl = readline.createInterface({ input: process.stdin });
rl.on('line', (input: string) => {
    if (typeof input !== 'string') {
        return Server.getLogger().warn('Got an invalid command!');
    }

    if (!(input.startsWith('/'))) {
        input = `/${input.toLowerCase()}`;
    }

    return (Server.getCommandManager() as any).dispatchCommand(
        new ConsoleSender(Server), input
    );
});


Server.listen(Server.getConfig().getServerIp(),Server.getConfig().getPort()).catch(() => {
    Server.getLogger().error(`Cannot start the server, is it already running on the same port?`);
    Server.kill();
    process.exit(1);
});

// Kills the server when exiting process
let exitEvents = ['SIGINT', 'SIGUSR1', 'SIGUSR2', 'SIGTERM'];
for (let event of exitEvents) {
    process.on(event, () => {
        Server.kill();
    });
}

module.exports = Server;
