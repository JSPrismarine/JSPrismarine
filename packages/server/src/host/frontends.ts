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

/**
 * Loads the terminal UI frontend when the console package is available.
 *
 * Returns `undefined` until the app slice replaces this with a lazy
 * `import('@jsprismarine/console')` that wraps `startConsole` in a {@link ConsoleFrontend}.
 * The import must stay lazy and behind the TUI gate: `@opentui/core` loads a native library
 * on import, and the plain path must never touch it.
 */
export const loadTuiFrontend = async (): Promise<ConsoleFrontend | undefined> => undefined;
