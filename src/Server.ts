import Prismarine from './Prismarine';
import ConfigBuilder from './config';
import LoggerBuilder from './utils/Logger';

const Config = new ConfigBuilder();
const Logger = new LoggerBuilder();

const Server = new Prismarine({
    config: Config,
    logger: Logger,
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

export default Server;
