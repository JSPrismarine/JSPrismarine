import { FileTransport, Logger } from '@jsprismarine/logger';
import { Config, Server } from '@jsprismarine/prismarine';

import path from 'node:path';

process.title = 'JSPrismarine';

// Values already in the environment win, then earlier files over later ones,
// matching the dotenv behavior this replaces.
for (const file of ['.env.local', '.env', '.env.development.local', '.env.development']) {
    try {
        process.loadEnvFile(path.join(process.cwd(), file));
    } catch {
        // The file is optional.
    }
}

const date = new Date();
let logFile = 'jsprismarine-development.log';

if (process.env.NODE_ENV !== 'development')
    logFile = `jsprismarine.${(date.getMonth() + 1).toString().padStart(2, '0')}${date
        .getDate()
        .toString()
        .padStart(2, '0')}${date.getFullYear().toString().padStart(2, '0')}-${date
        .getHours()
        .toString()
        .padStart(2, '0')}${date.getMinutes().toString().padStart(2, '0')}${date
        .getSeconds()
        .toString()
        .padStart(2, '0')}.log`;

const config = new Config();
const logger = new Logger(config.getLogLevel(), [
    new FileTransport({
        level: 'debug',
        filename: path.join(process.cwd(), process.env.JSP_DIR || '', 'logs', logFile)
    })
]);
const server = new Server({
    config,
    logger
});

let forceExitTriggered = false;
['SIGSEGV', 'SIGHUP', 'SIGINT', 'SIGTERM', 'uncaughtException'].forEach((signal) => {
    process.on(signal, async (error) => {
        // Handle spamming ctrl+c.
        if (forceExitTriggered) {
            process.exit(1);
        }
        forceExitTriggered = true;

        if (error instanceof Error) {
            logger.error(error);
        }

        void server.shutdown({ crash: error === 'uncaughtException' });
    });
});

// In a function rather than top-level await so the entry also works where top-level
// await cannot: a single-executable application runs its main script as CommonJS.
const bootstrap = async (): Promise<void> => {
    try {
        await server.bootstrap(config.getServerIp(), config.getServerPort());
    } catch (error: unknown) {
        logger.warn(`Cannot start the server, is it already running on the same port?`);
        throw error; // Re-throw it so `process.on` can handle it.
    }
};

void bootstrap();

export {};
