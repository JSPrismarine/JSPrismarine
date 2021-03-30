import { Config, Logger, Server } from '@jsprismarine/prismarine';

import Updater from '@jsprismarine/updater';
import fs from 'fs';
import path from 'path';

// Process metadata
process.title = 'Prismarine';

if (process.env.JSP_DIR && !fs.existsSync(path.join(process.cwd(), process.env.JSP_DIR)))
    fs.mkdirSync(path.join(process.cwd(), process.env.JSP_DIR));

const config = new Config(process.env.npm_package_version!);
const logger = new Logger();

const updater = new Updater({
    config,
    logger,
    version: process.env.npm_package_version!
});

void updater.check().then(() => {
    const Prismarine = new Server({
        config,
        logger,
        version: process.env.npm_package_version!
    });

    Prismarine.listen(config.getServerIp(), config.getPort()).catch(async (error) => {
        Prismarine.getLogger()?.error(`Cannot start the server, is it already running on the same port?`, 'Prismarine');
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
