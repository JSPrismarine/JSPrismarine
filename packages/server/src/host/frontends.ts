import type { SupervisorEvent } from '@jsprismarine/console-protocol';
import readline from 'node:readline';
import type { Readable } from 'node:stream';
import type { Supervisor } from './Supervisor';

/**
 * What the host shows the user while it supervises the server child. The terminal UI and the
 * plain line printer both fill this role; the host picks one and otherwise does not care.
 */
export interface ConsoleFrontend {
    /** Subscribes to the supervisor's events and links. Called once, before the first child spawns. */
    attach(supervisor: Supervisor): Promise<void>;
    /** Releases the terminal and stdin. Called before the host exits. */
    close(): Promise<void>;
}

/** Options for {@link plainFrontend}. */
export interface PlainFrontendOptions {
    /** Where lines go; defaults to `process.stdout`. */
    write?: (text: string) => void;
    /**
     * Where command lines come from; defaults to `process.stdin`. Each line is sent to the
     * current server child as a `command`. Nothing is read when the stream is already closed,
     * which is what `< /dev/null` leaves behind.
     */
    input?: Readable;
}

type AnsiColor = '31' | '32' | '33' | '36';

const notice = (message: string, color: AnsiColor = '33'): string => `\x1b[${color}m[dev] ${message}\x1b[0m\n`;

/**
 * Turns one supervisor event into the `[dev]` line the former `scripts/dev.mts` printed, or
 * nothing for events that only a status bar shows.
 */
export const formatSupervisorNotice = (event: SupervisorEvent): string | undefined => {
    switch (event.type) {
        case 'supervisor.watching':
            return notice(`watching ${event.root} for changes`, '36');
        case 'supervisor.changed':
            return notice(`change detected: ${event.path}`);
        case 'supervisor.generating':
            if (event.ok === undefined) return notice('generating bedrock-data...', '36');
            return event.ok ? undefined : notice('bedrock-data generation failed', '31');
        case 'supervisor.output':
            return `${event.text}\n`;
        case 'supervisor.state':
            switch (event.state) {
                case 'restarting':
                    return notice('restarting...', '32');
                case 'crashed':
                    return notice(`server exited with code ${event.code}, waiting for changes...`, '31');
                case 'stopped':
                    return event.signal ? notice(`server stopped by ${event.signal}`, '31') : undefined;
                default:
                    return undefined;
            }
    }
};

/**
 * The frontend for a host without a terminal UI, which is `--watch` under a pipe, in CI, or
 * with `--no-tui`. It prints the server's log lines as the server formatted them, the child's
 * raw stdout and stderr, and the supervisor's notices in the colored `[dev]` style, and it
 * forwards each line typed on stdin to the server as a command.
 */
export const plainFrontend = (options: PlainFrontendOptions = {}): ConsoleFrontend => {
    const write = options.write ?? ((text: string) => process.stdout.write(text));
    const input = options.input ?? process.stdin;
    const cleanups: Array<() => void> = [];
    let reader: readline.Interface | undefined;
    let nextCommand = 0;

    return {
        async attach(supervisor) {
            cleanups.push(
                supervisor.onEvent((event) => {
                    const line = formatSupervisorNotice(event);
                    if (line !== undefined) write(line);
                })
            );
            cleanups.push(
                supervisor.onLink((link) => {
                    link.onMessage((message) => {
                        if (message.type === 'log') write(`${message.formatted}\n`);
                        else if (message.type === 'log.dropped')
                            write(notice(`${message.count} log lines were dropped`, '31'));
                        else if (message.type === 'command.result' && !message.ok && message.error)
                            write(notice(message.error, '31'));
                    });
                })
            );

            if (input.destroyed || !input.readable) return;
            reader = readline.createInterface({ input, terminal: false, crlfDelay: Number.POSITIVE_INFINITY });
            reader.on('line', (line) => {
                if (line.trim() === '') return;
                nextCommand += 1;
                supervisor.serverLink?.send({ type: 'command', v: 1, id: `plain-${nextCommand}`, line });
            });
        },
        async close() {
            reader?.close();
            reader = undefined;
            for (const cleanup of cleanups.splice(0)) cleanup();
        }
    };
};

/** The part of `@jsprismarine/console` the host uses, loaded on demand. */
export type ConsoleModule = Pick<typeof import('@jsprismarine/console'), 'startConsole'>;

/** Options for {@link loadTuiFrontend}. */
export interface TuiFrontendOptions {
    /** Shown in the title bar. */
    serverName: string;
    /** Shown in the title bar. */
    version: string;
    /** Where the console reads and writes command history. */
    historyFile: string;
    /**
     * Imports the console package; defaults to `import('@jsprismarine/console')`. Injected so
     * tests run without the native renderer.
     */
    load?: () => Promise<ConsoleModule>;
    /** Prints the one line that explains a fallback; defaults to `console.warn`. */
    warn?: (line: string) => void;
    /** Builds the frontend used when the console starts but its renderer fails; defaults to {@link plainFrontend}. */
    fallback?: () => ConsoleFrontend;
}

const errorText = (error: unknown): string => (error instanceof Error ? error.message : String(error));

const importConsole = (): Promise<ConsoleModule> => import('@jsprismarine/console');

/**
 * Loads the terminal UI frontend.
 *
 * The console package is imported here and nowhere else in the host, after the TUI gate has
 * passed, because `@opentui/core` loads a native library on import and the plain and
 * `--role server` paths must never touch it. When the import fails this prints one line
 * naming the cause and returns `undefined` so the entry runs the plain frontend. When the
 * import works but the renderer cannot start on `attach`, the returned frontend prints the
 * cause and hands the supervisor to the fallback instead, so the server still gets a console.
 */
export const loadTuiFrontend = async (options: TuiFrontendOptions): Promise<ConsoleFrontend | undefined> => {
    const warn = options.warn ?? ((line: string) => console.warn(line));
    let startConsole: ConsoleModule['startConsole'];
    try {
        ({ startConsole } = await (options.load ?? importConsole)());
    } catch (error) {
        warn(`prismarine: the terminal UI is unavailable (${errorText(error)}); using the line console.`);
        return undefined;
    }

    let handle: Awaited<ReturnType<typeof startConsole>> | undefined;
    let fallback: ConsoleFrontend | undefined;
    return {
        async attach(supervisor) {
            try {
                handle = await startConsole({
                    supervisor,
                    serverName: options.serverName,
                    version: options.version,
                    historyFile: options.historyFile
                });
            } catch (error) {
                warn(`prismarine: the terminal UI could not start (${errorText(error)}); using the line console.`);
                fallback = (options.fallback ?? plainFrontend)();
                await fallback.attach(supervisor);
            }
        },
        async close() {
            await handle?.close();
            await fallback?.close();
            handle = undefined;
            fallback = undefined;
        }
    };
};
