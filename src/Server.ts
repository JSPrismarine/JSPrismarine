import readline from 'readline';
import Prismarine from './Prismarine';
import ConsoleSender from './utils/ConsoleSender';
import ConfigBuilder from './config';
import LoggerBuilder from './utils/Logger';

const Config = new ConfigBuilder();
const Logger = new LoggerBuilder();


const Server = new Prismarine({
    config: Config,
    logger: Logger,
});

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


Server.listen(Server.getConfig().getServerIp(), Server.getConfig().getPort()).catch((err) => {
    Server.getLogger().error(`Cannot start the server, is it already running on the same port?`);
    if (err)
        Server.getLogger().error(err);
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
