import { Config, Logger, Server } from '@jsprismarine/prismarine';

import path from 'node:path';
import dotenv from 'dotenv';

import pkg from '../package.json' assert { type: 'json' };

// Process metadata
process.title = 'Prismarine';

dotenv.config({
    path: [
        path.join(process.cwd(), '.env'),
        path.join(process.cwd(), '.env.local'),
        path.join(process.cwd(), '.env.development'),
        path.join(process.cwd(), '.env.development.local')
    ]
});

const version = (pkg.version as string) || 'unknown';

(async () => {
    const config = new Config(version);
    const logger = new Logger();
    const server = new Server({
        config,
        logger,
        version
    });

    ['SIGINT', 'SIGTERM', 'uncaughtException'].forEach((signal) =>
        process.on(signal, async (error) => {
            if (error instanceof Error) {
                logger.error(error, 'Server');
            }
            await server.shutdown({ crash: error === 'uncaughtException' });
        })
    );

    try {
        await server.bootstrap(config.getServerIp(), config.getServerPort());
    } catch (error: unknown) {
        logger.error(`Cannot start the server, is it already running on the same port?`, 'Server');
        logger.error(error, 'Server');
        await server.shutdown({ crash: true });
    }
})();
