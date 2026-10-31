import type { ConsoleMessage, ServerMessage } from '@jsprismarine/console-protocol';
import { childProcessLink, isConsoleMessage } from '@jsprismarine/console-protocol';
import type { LogTransport } from '@jsprismarine/logger';
import { FileTransport, Logger } from '@jsprismarine/logger';
import { Config, readContentSettings, RemoteConsole, RemoteLogTransport, Server } from '@jsprismarine/prismarine';
import { resolvePackStack } from '@jsprismarine/prismarine/content/packStack';

import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import pkg from '../package.json' with { type: 'json' };
import type { ServerArgs } from './cli/Cli';
import { parseServerArgs } from './cli/Cli';
import { handleFatalErrors } from './host/fatal';
import type { ConsoleFrontend } from './host/frontends';
import { loadTuiFrontend, plainFrontend } from './host/frontends';
import { spawnServerChild } from './host/ServerChild';
import { Supervisor } from './host/Supervisor';
import { decideMode, probeFfi } from './host/tuiGate';
import { suppressFfiWarning } from './host/warnings';
import { Watcher } from './host/Watcher';
import { provisionPackagedData } from './packaged/provision';
import { createDevToolsLogTransport, openDevTools } from './devtools/DevTools';
import { DevToolsRelay } from './devtools/DevToolsRelay';

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

/** The monorepo's `packages/` directory, which `--watch` watches and generates bedrock-data in. */
const packagesDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');

const contentPackPaths = (): string[] => {
    try {
        const settings = readContentSettings();
        const { stack } = resolvePackStack({
            worldPacks: settings.worldPacks.map((packPath) => ({ kind: 'directory', path: packPath })),
            pluginPacks: settings.datapacks.map((packPath) => ({ kind: 'datapack', path: packPath }))
        });
        return stack.map((source) => path.resolve(process.cwd(), source.path));
    } catch {
        // The server child reports content configuration errors; keep source watching active.
        return [];
    }
};

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

    const devtools = args.devtools || args.devtoolsWait ? openDevTools() : undefined;
    if (devtools) {
        if (remote) process.stderr.write(`JSPrismarine inspector target: ${devtools.endpointUrl}\n`);
        else {
            process.stderr.write(`JSPrismarine DevTools: ${devtools.frontendUrl}\n`);
            process.stderr.write(`JSPrismarine inspector: ${devtools.endpointUrl}\n`);
        }
        if (args.devtoolsWait) devtools.waitForDebugger();
    }

    const config = new Config({ serverPort: args.port });
    const transports: LogTransport[] = [fileTransport(config), ...(devtools ? [createDevToolsLogTransport()] : [])];
    let attach: ((server: Server) => void) | undefined;
    if (remote) {
        const link = childProcessLink<ConsoleMessage, ServerMessage>({ validate: isConsoleMessage });
        const transport = new RemoteLogTransport(link);
        transports.push(transport);
        attach = (server) => server.attachRemoteConsole(new RemoteConsole(server, link, transport));
    }

    const logger = new Logger(config.getLogLevel(), transports);
    const server = new Server({
        config,
        logger,
        headless: remote || args.headless,
        profile: devtools !== undefined
    });
    if (devtools) server.releaseOnShutdown(() => devtools.close());
    attach?.(server);

    if (devtools) {
        Object.defineProperty(globalThis, 'jsprismarine', {
            configurable: true,
            enumerable: true,
            value: Object.freeze({
                server,
                levels: () => server.getWorldManager().getLevels(),
                worlds: () =>
                    server
                        .getWorldManager()
                        .getLevels()
                        .flatMap((level) => [...level.worlds()]),
                world: (name: string) => server.getWorldManager().getWorldByName(name),
                entities: (name: string) => server.getWorldManager().getWorldByName(name)?.getEntities() ?? [],
                entityRuntime: (dimension: string) => server.getEntityRuntime(dimension)
            })
        });
    }

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

/**
 * Runs this process as the host: it owns the terminal, spawns the server as a child with
 * `--role server`, and shows the chosen frontend. With `--watch` it also restarts the child
 * when workspace source or loaded content data changes.
 */
const runHost = async (args: ServerArgs, frontend: ConsoleFrontend | undefined): Promise<void> => {
    process.title = 'JSPrismarine host';
    const ui = frontend ?? plainFrontend();
    const devtoolsRelay = args.devtools || args.devtoolsWait ? new DevToolsRelay() : undefined;
    if (devtoolsRelay) {
        await devtoolsRelay.start();
        process.stderr.write(`JSPrismarine DevTools: ${devtoolsRelay.frontendUrl}\n`);
        process.stderr.write(`JSPrismarine inspector: ${devtoolsRelay.endpointUrl}\n`);
    }

    const supervisor = new Supervisor({
        spawnChild: () => spawnServerChild({ userArgs: process.argv.slice(2) }),
        // Only the watcher ever restarts a crashed child; without it a crash ends the host.
        canRestart: args.watch,
        exit: async (code) => {
            try {
                try {
                    await devtoolsRelay?.close();
                } finally {
                    await ui.close();
                }
            } finally {
                process.exit(code);
            }
        }
    });
    if (devtoolsRelay) {
        supervisor.onEvent((event) => {
            if (event.type !== 'supervisor.output' || event.stream !== 'stderr') return;
            const prefix = 'JSPrismarine inspector target: ';
            if (event.text.startsWith(prefix)) devtoolsRelay.setTarget(event.text.slice(prefix.length));
        });
    }
    supervisor.handleSignals();
    // Before the frontend attaches, so this runs ahead of any handler the TUI registers.
    handleFatalErrors({ supervisor, ui });
    await ui.attach(supervisor);

    if (args.watch) {
        await new Watcher({
            packagesDir,
            contentPackPaths: contentPackPaths(),
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

    // A packaged binary carries its data and fetches the rest on first run; a no-op anywhere
    // else. Before the role switch, so the host and an in-process server both start warm.
    try {
        await provisionPackagedData((line) => process.stdout.write(`${line}\n`));
    } catch (error: unknown) {
        process.stderr.write(`prismarine: ${error instanceof Error ? error.message : String(error)}\n`);
        process.exitCode = 1;
        return;
    }

    if (args.role === 'server') {
        runInProcess(args, { remote: true });
        return;
    }

    // `packages/` for both `src/Server.ts` and `dist/Server.es.js` in the monorepo, but
    // `node_modules/@jsprismarine/` for an installed package, where there is nothing to watch.
    if (args.watch && !existsSync(path.join(packagesDir, '..', 'pnpm-workspace.yaml'))) {
        process.stderr.write('prismarine: --watch needs the JSPrismarine repository\n');
        process.exitCode = 2;
        return;
    }

    suppressFfiWarning();
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
    if (tui || args.watch) {
        await runHost(args, tui);
        return;
    }

    runInProcess(args, { remote: false });
};

void main();

export {};
