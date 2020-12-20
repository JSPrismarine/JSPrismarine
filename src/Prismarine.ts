import Config from './config/Config';
import Logger from './utils/Logger';
import Server from './Server';

const config = new Config();
const Prismarine = new Server({
    config: config,
    logger: new Logger()
});

Prismarine.listen(config.getServerIp(), config.getPort()).catch((err) => {
    Prismarine.getLogger().error(
        `Cannot start the server, is it already running on the same port?`
    );
    if (err) console.error(err);

    Prismarine.kill();
    process.exit(1);
});

// Kills the server when exiting process
for (let interruptSignal of ['SIGINT', 'SIGUSR1', 'SIGUSR2', 'SIGTERM']) {
    process.on(interruptSignal, () => {
        Prismarine.kill();
    });
}

(global as any).Server = Prismarine;
export default Prismarine;
