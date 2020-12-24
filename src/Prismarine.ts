import Config from './config/Config';
import Logger from './utils/Logger';
import Server from './Server';
import Updater from './updater/Updater';

const config = new Config();
const logger = new Logger();

const updater = new Updater({
    config,
    logger
});

updater.check().then(() => {
    const Prismarine = new Server({
        config,
        logger
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
});
