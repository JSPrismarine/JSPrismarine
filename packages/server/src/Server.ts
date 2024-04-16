import colorParser from '@jsprismarine/color-parser';
import { Logger } from '@jsprismarine/logger';
import { Config, Server } from '@jsprismarine/prismarine';
import { format, transports } from 'winston';

import dotenv from 'dotenv';
import path from 'node:path';

process.title = 'JSPrismarine';

dotenv.config({
    path: [
        path.join(process.cwd(), '.env'),
        path.join(process.cwd(), '.env.local'),
        path.join(process.cwd(), '.env.development'),
        path.join(process.cwd(), '.env.development.local')
    ]
});

(async () => {
    const date = new Date();
    let logFile = 'jsprismarine-development.log';

    // mmddyyyy-hh-mm-ss. yes American-style, sue me.
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

export {};
