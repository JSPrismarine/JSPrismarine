import colorParser from '@jsprismarine/color-parser';
import { Logger } from '@jsprismarine/logger';
import { Config, Server } from '@jsprismarine/prismarine';
import { format, transports } from 'winston';

import dotenv from 'dotenv';
import path from 'node:path';

process.title = 'JSPrismarine';

dotenv.config({
    path: [
        path.join(process.cwd(), '.env.local'),
        path.join(process.cwd(), '.env'),
        path.join(process.cwd(), '.env.development.local'),
        path.join(process.cwd(), '.env.development')
    ]
});

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
    new transports.File({
        level: 'debug',
        filename: path.join(process.cwd(), process.env.JSP_DIR || '', 'logs', logFile),
        format: format.printf(({ level, message, timestamp, namespace }: any) => {
            return `[${timestamp}] [${level}]${colorParser(
                `${namespace ? ` [${namespace}]` : ''}: ${message}`
            )}`.replaceAll(/[\u001b\u009b][[()#;?]*(?:[0-9]{1,4}(?:;[0-9]{0,4})*)?[0-9A-ORZcf-nqry=><]/g, '');
        })
    })
]);
const server = new Server({
    config,
    logger: logger as any
});

['SIGSEGV', 'SIGHUP', 'uncaughtException'].forEach((signal) => {
    try {
        process.on(signal, async (error) => {
            if (error instanceof Error) {
                logger.error(error);
            }

            void server.shutdown({ crash: error === 'uncaughtException' });

            // FIXME: This is a temporary fix for the server not shutting down properly.
            process.exit(1);
        });
    } catch {}
});

try {
    await server.bootstrap(config.getServerIp(), config.getServerPort());
} catch (error: unknown) {
    console.warn(`Cannot start the server, is it already running on the same port?`);
    console.error(error);
    await server.shutdown({ crash: true });
}

export {};
