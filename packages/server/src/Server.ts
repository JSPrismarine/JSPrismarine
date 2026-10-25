import { FileTransport, Logger } from '@jsprismarine/logger';
import { Config, Server } from '@jsprismarine/prismarine';

import path from 'node:path';
import { parseServerArgs } from './cli/Cli';

const startServer = async (): Promise<void> => {
    let args: ReturnType<typeof parseServerArgs>;
    try {
        args = parseServerArgs(process.argv.slice(2));
    } catch (error: unknown) {
        process.stderr.write(`prismarine: ${error instanceof Error ? error.message : String(error)}\n`);
        process.exitCode = 2;
        return;
    }

    if (args.help || args.version || args._.includes('completion')) return;

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

    const config = new Config({ serverPort: args.port });
    const logger = new Logger(config.getLogLevel(), [
        new FileTransport({
            level: config.getLogLevel(),
            // `resolve`, not `join`, so an absolute JSP_DIR such as /data is used as is, the way
            // the rest of the server resolves it.
            filename: path.resolve(process.cwd(), process.env.JSP_DIR || '', 'logs', logFile)
        })
    ]);
    const server = new Server({ config, logger });

    const stop = (options?: { crash?: boolean }): void => {
        server.shutdown(options).catch((error: unknown) => {
            logger.error(error);
            process.exit(1);
        });
    };

    /** The signals that ask this server to stop, as opposed to reporting that it has broken. */
    const TERMINATION_SIGNALS = ['SIGINT', 'SIGTERM', 'SIGHUP'] as const;

    // A listener takes Node's default disposition away, and that default is the only thing
    // that can end this process while the event loop is blocked - which, on a server
    // generating terrain, is most of the time. Measured against a loop held for five seconds:
    // the default killed at the signal, a listener ran 3.3 seconds after it. So the listeners
    // last exactly as long as it takes to decide to stop, and the next signal is the kernel's
    // again. `removeAllListeners` rather than removing these by reference, because one
    // listener left behind by anything else would keep the default switched off.
    server.releaseOnShutdown(() => {
        for (const signal of TERMINATION_SIGNALS) process.removeAllListeners(signal);
    });

    for (const signal of TERMINATION_SIGNALS) process.on(signal, () => stop());

    // Not a request to stop but a report that the process is already lost, which is what
    // `crash` tells the shutdown. The previous single handler compared its argument against
    // the string 'uncaughtException' - a value no listener is ever passed, since a signal
    // listener gets the signal's name and this one gets the error - so a crash shut down as
    // though it had been asked to politely.
    process.on('SIGSEGV', () => stop({ crash: true }));
    process.on('uncaughtException', (error: Error) => {
        logger.error(error);
        stop({ crash: true });
    });

    // In a function rather than top-level await so the entry also works where top-level
    // await cannot: a single-executable application runs its main script as CommonJS.
    const bootstrap = async (): Promise<void> => {
        try {
            await server.bootstrap();
        } catch (error: unknown) {
            logger.warn(`Cannot start the server, is it already running on the same port?`);
            throw error; // Re-throw it so `process.on` can handle it.
        }

        // Something referenced, held for as long as the server runs. The socket and the tick
        // timer are `unref`ed on purpose - a library must not keep its host process alive -
        // and without a TTY the console never holds stdin open, so a headless server, as in
        // a container, exited right after it began listening. Nothing clears this: `shutdown`
        // ends the process with `process.exit`.
        setInterval(() => {}, 1 << 30);
    };

    void bootstrap();
};

void startServer();

export {};
