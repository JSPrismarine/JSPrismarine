import type { ConsoleMessage, ServerMessage } from '@jsprismarine/console-protocol';
import { childProcessLink, isConsoleMessage } from '@jsprismarine/console-protocol';
import type { LogTransport } from '@jsprismarine/logger';
import { FileTransport, Logger } from '@jsprismarine/logger';
import { Config, RemoteConsole, RemoteLogTransport, Server } from '@jsprismarine/prismarine';

import path from 'node:path';
import { fileURLToPath } from 'node:url';
import pkg from '../package.json' with { type: 'json' };
import type { ServerArgs } from './cli/Cli';
import { parseServerArgs } from './cli/Cli';
import type { ConsoleFrontend } from './host/frontends';
import { loadTuiFrontend, plainFrontend } from './host/frontends';
import { spawnServerChild } from './host/ServerChild';
import { Supervisor } from './host/Supervisor';
import { decideMode, probeFfi } from './host/tuiGate';
import { Watcher } from './host/Watcher';

/**
 * Values already in the environment win, then earlier files over later ones, matching the
 * dotenv behavior this replaces. The host loads them too and passes its environment to the
 * child, so both see the same values.
 */
const loadEnvFiles = (): void => {
    for (const file of ['.env.local', '.env', '.env.development.local', '.env.development']) {
        try {
            process.loadEnvFile(path.join(process.cwd(), file));
        } catch {
            // The file is optional.
        }
    }
};

const logFileName = (): string => {
    if (process.env.NODE_ENV === 'development') return 'jsprismarine-development.log';
    const date = new Date();
    const pad = (value: number): string => value.toString().padStart(2, '0');
    const day = `${pad(date.getMonth() + 1)}${pad(date.getDate())}${date.getFullYear()}`;
    const time = `${pad(date.getHours())}${pad(date.getMinutes())}${pad(date.getSeconds())}`;
    return `jsprismarine.${day}-${time}.log`;
};

/**
 * A path inside the server's data directory. `resolve`, not `join`, so an absolute JSP_DIR
 * such as /data is used as is, the way the rest of the server resolves it.
 */
const dataPath = (...segments: string[]): string => path.resolve(process.cwd(), process.env.JSP_DIR || '', ...segments);

const fileTransport = (config: Config): FileTransport =>
    new FileTransport({
        level: config.getLogLevel(),
        filename: dataPath('logs', logFileName())
    });

/**
 * Runs the server in this process. This is today's path: the line console when stdin is
 * available and `headless` is off, the log file either way, and the process's own signal
 * handlers for shutdown. With `remote` set the server is headless and speaks the console
 * protocol over the IPC channel its host opened.
 */
const runInProcess = (args: ServerArgs, { remote }: { remote: boolean }): void => {
    process.title = 'JSPrismarine';

    const config = new Config({ serverPort: args.port });
    const transports: LogTransport[] = [fileTransport(config)];
    let attach: ((server: Server) => void) | undefined;
    if (remote) {
        const link = childProcessLink<ConsoleMessage, ServerMessage>({ validate: isConsoleMessage });
        const transport = new RemoteLogTransport(link);
        transports.push(transport);
        attach = (server) => server.attachRemoteConsole(new RemoteConsole(server, link, transport));
    }

    const logger = new Logger(config.getLogLevel(), transports);
    const server = new Server({ config, logger, headless: remote || args.headless });
    attach?.(server);

    let forceExitTriggered = false;
    for (const signal of ['SIGSEGV', 'SIGHUP', 'SIGINT', 'SIGTERM', 'uncaughtException'] as const) {
        process.on(signal, async (error: unknown) => {
            // Handle spamming ctrl+c.
            if (forceExitTriggered) {
                process.exit(1);
            }
            forceExitTriggered = true;

            if (error instanceof Error) {
                logger.error(error);
            }

            void server.shutdown({ crash: signal === 'uncaughtException' });
        });
    }

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

/**
 * Runs this process as the host: it owns the terminal, spawns the server as a child with
 * `--role server`, and shows the chosen frontend. With `--watch` it also restarts the child
 * when a workspace package changes.
 */
const runHost = async (args: ServerArgs, frontend: ConsoleFrontend | undefined): Promise<void> => {
    process.title = 'JSPrismarine host';
    const ui = frontend ?? plainFrontend();

    const supervisor = new Supervisor({
        spawnChild: () => spawnServerChild({ userArgs: process.argv.slice(2) }),
        exit: async (code) => {
            await ui.close();
            process.exit(code);
        }
    });
    supervisor.handleSignals();
    await ui.attach(supervisor);

    if (args.watch) {
        const packagesDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
        new Watcher({
            packagesDir,
            onEvent: (event) => supervisor.emit(event),
            requestRestart: (reason) => supervisor.restart(reason)
        }).start();
    }

    await supervisor.start();
};

const main = async (): Promise<void> => {
    let args: ServerArgs;
    try {
        args = parseServerArgs(process.argv.slice(2));
    } catch (error: unknown) {
        process.stderr.write(`prismarine: ${error instanceof Error ? error.message : String(error)}\n`);
        process.exitCode = 2;
        return;
    }

    if (args.help || args.version || args._.includes('completion')) return;

    loadEnvFiles();

    if (args.role === 'server') {
        runInProcess(args, { remote: true });
        return;
    }

    const decision = args.headless
        ? { mode: 'plain' as const }
        : await decideMode({
              noTui: args.noTui,
              env: process.env,
              stdinIsTTY: process.stdin.isTTY,
              stdoutIsTTY: process.stdout.isTTY,
              term: process.env.TERM,
              ffiAvailable: probeFfi
          });
    if (decision.reason) process.stderr.write(`prismarine: ${decision.reason}\n`);

    const tui =
        decision.mode === 'tui'
            ? await loadTuiFrontend({
                  // The config file lives in the child, so the title bar shows the product name.
                  serverName: 'JSPrismarine',
                  version: pkg.version,
                  historyFile: dataPath('.console_history')
              })
            : undefined;
    if (tui || (args.watch && !args.headless)) {
        await runHost(args, tui);
        return;
    }

    runInProcess(args, { remote: false });
};

void main();

export {};
