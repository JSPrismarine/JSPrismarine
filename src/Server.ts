import Prismarine from './Prismarine';
import Config from './config/Config';
import Logger from './utils/Logger';

const config = new Config();
const Server = new Prismarine({
    config: config,
    logger: new Logger()
});

Server.listen(config.getServerIp(), config.getPort()).catch((err) => {
    Server.getLogger().error(
        `Cannot start the server, is it already running on the same port?`
    );
    if (err) console.error(err);

    Server.kill();
    process.exit(1);
});

// Kills the server when exiting process
for (let interruptSignal of ['SIGINT', 'SIGUSR1', 'SIGUSR2', 'SIGTERM']) {
    process.on(interruptSignal, () => {
        Server.kill();
    });
}

(global as any).Prismarine = Server;
export default Server;
