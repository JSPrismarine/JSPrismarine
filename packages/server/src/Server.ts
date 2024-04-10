import { Config, Logger, Server } from '@jsprismarine/prismarine';

import path from 'node:path';
import dotenv from 'dotenv';

const isDev = process.env.NODE_ENV === 'development';
process.title = 'JSPrismarine';

dotenv.config({
    path: [
        path.join(process.cwd(), '.env'),
        path.join(process.cwd(), '.env.local'),
        ...((isDev && [
            path.join(process.cwd(), '.env.development'),
            path.join(process.cwd(), '.env.development.local')
        ]) ||
            [])
    ]
});

(async () => {
    const config = new Config();
    const logger = new Logger();
    const server = new Server({
        config,
        logger
    });

    [
        'SIGABRT',
        'SIGBREAK',
        'SIGINT',
        'SIGKILL',
        'SIGQUIT',
        'SIGSEGV',
        'SIGTERM',
        'SIGSTOP',
        'uncaughtException'
    ].forEach((signal) => {
        try {
            process.on(signal, async (error) => {
                if (error instanceof Error) {
                    logger.error(error);
                }
                await server.shutdown({ crash: error === 'uncaughtException' });
            });
        } catch {}
    });

    try {
        await server.bootstrap(config.getServerIp(), config.getServerPort());
    } catch (error: unknown) {
        logger.error(`Cannot start the server, is it already running on the same port?`);
        logger.error(error);
        await server.shutdown({ crash: true });
    }
})();
