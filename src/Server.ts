import Prismarine from './Prismarine';
import ConfigBuilder from './config/Config';
import LoggerBuilder from './utils/Logger';

const Server = new Prismarine({
    config: new ConfigBuilder(),
    logger: new LoggerBuilder()
});

Server.listen(
    Server.getConfig().getServerIp(),
    Server.getConfig().getPort()
).catch((err) => {
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
