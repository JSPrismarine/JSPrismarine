import { Config, Logger, Server } from '@jsprismarine/prismarine';

import path from 'node:path';
import dotenv from 'dotenv';

const isDev = process.env.NODE_ENV === 'development';

// Process metadata
process.title = 'Prismarine';

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

    ['SIGINT', 'SIGTERM', 'uncaughtException'].forEach((signal) =>
        process.on(signal, async (error) => {
            if (error instanceof Error) {
                logger.error(error);
            }
            await server.shutdown({ crash: error === 'uncaughtException' });
        })
    );

    try {
        await server.bootstrap(config.getServerIp(), config.getServerPort());
    } catch (error: unknown) {
        logger.error(`Cannot start the server, is it already running on the same port?`);
        logger.error(error);
        await server.shutdown({ crash: true });
    }
})();
