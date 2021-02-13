import Config from './config/Config';
import Logger from './utils/Logger';
import Server from './Server';
import Updater from './updater/Updater';

// Process metadata
process.title = 'Prismarine';

const config = new Config();
const logger = new Logger();

const updater = new Updater({
    config,
    logger
});

void updater.check().then(() => {
    const Prismarine = new Server({
        config,
        logger
    });

    Prismarine.listen(config.getServerIp(), config.getPort()).catch(async (error) => {
        Prismarine.getLogger().error(`Cannot start the server, is it already running on the same port?`, 'Prismarine');
        if (error) console.error(error);

        await Prismarine.kill({
            crash: true
        });
    });

    // Kills the server when exiting process
    [
        'uncaughtException',
        'unhandledRejection',
        'SIGHUP',
        'SIGINT',
        'SIGQUIT',
        'SIGILL',
        'SIGTRAP',
        'SIGABRT',
        'SIGBUS',
        'SIGFPE',
        'SIGUSR1',
        'SIGSEGV',
        'SIGUSR2',
        'SIGTERM'
    ].forEach((interruptSignal) =>
        process.on(interruptSignal, async () => {
            await Prismarine.kill();
        })
    );

    (global as any).Server = Prismarine;
});
