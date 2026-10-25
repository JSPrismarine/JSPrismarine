import { PROTOCOL_VERSION } from '@jsprismarine/console-protocol';
import type { ConsoleMessage, MessageLink, ServerMessage, SupervisorEvent } from '@jsprismarine/console-protocol';
import { createCliRenderer } from '@opentui/core';
import type { CliRenderer, CliRendererConfig } from '@opentui/core';
import { randomUUID } from 'node:crypto';
import { join } from 'node:path';

import { createApp } from './app/createApp';
import type { CommandOutcome } from './app/createApp';
import { CommandHistory } from './input/history';
import type { CompletionResult } from './input/inputBar';
import { LogStore } from './log/logStore';
import { resolveTheme } from './theme';

/** The console's view of the server link: it receives server messages and sends console messages. */
export type ServerLink = MessageLink<ServerMessage, ConsoleMessage>;

/**
 * The part of the host's supervisor the console uses. `Supervisor` in `@jsprismarine/server`
 * satisfies it directly.
 */
export interface ConsoleSupervisor {
    /** Subscribes to supervisor events. Returns the unsubscribe function. */
    onEvent(listener: (event: SupervisorEvent) => void): () => void;
    /**
     * Runs the listener with the link of each new server generation. A listener that accepts
     * `undefined` also works with hosts that report the loss of a link that way.
     */
    onLink(listener: (link: ServerLink | undefined) => void): () => void;
    /** Restarts the server; `reason` is the host's label for the restart. */
    restart(reason: string): void;
    stop(): void;
    forceStop(): void;
}

/** Everything {@link startConsole} needs from the host. */
export interface StartConsoleOptions {
    supervisor: ConsoleSupervisor;
    /** Where command history is read and written. Defaults to `${JSP_DIR ?? 'jsp'}/.console_history`. */
    historyFile?: string;
    /** Server name for the title bar. */
    serverName?: string;
    /** Server version for the title bar. */
    version?: string;
    /** Environment read for `NO_COLOR` and `JSP_DIR`; defaults to `process.env`. */
    env?: NodeJS.ProcessEnv;
    /** Terminal output; defaults to `process.stdout`. Its color depth picks the theme. */
    stdout?: NodeJS.WriteStream;
    /** Terminal input; defaults to `process.stdin`. */
    stdin?: NodeJS.ReadStream;
    /** Builds the renderer. Tests inject `createTestRenderer`; production uses `createCliRenderer`. */
    createRenderer?: (config: CliRendererConfig) => Promise<CliRenderer>;
}

/** A running console. */
export interface ConsoleHandle {
    /** Saves history, destroys the renderer, waits for the terminal to be restored, and removes the fallback handlers. */
    close(): Promise<void>;
}

/** Milliseconds a command or completion request waits for the server's answer. */
export const REQUEST_TIMEOUT_MS = 10_000;

/**
 * Escape sequence that undoes everything the renderer turns on: pops the kitty keyboard flags,
 * turns focus reporting, synchronized output, mouse reporting, and bracketed paste off, resets
 * text attributes, leaves the alternate screen, and shows the cursor.
 */
export const TERMINAL_RESET = [
    '\x1b[<u',
    '\x1b[?1004l',
    '\x1b[?2026l',
    '\x1b[?1000l',
    '\x1b[?1002l',
    '\x1b[?1003l',
    '\x1b[?1006l',
    '\x1b[?2004l',
    '\x1b[0m',
    '\x1b[?1049l',
    '\x1b[?25h'
].join('');

type ResultType = 'command.result' | 'complete.result';
type ResultMessage<T extends ResultType> = Extract<ServerMessage, { type: T }>;

interface PendingRequest {
    resolve(message: ServerMessage): void;
    reject(error: Error): void;
    timer: ReturnType<typeof setTimeout>;
}

const isResult = (message: ServerMessage): message is ResultMessage<ResultType> =>
    message.type === 'command.result' || message.type === 'complete.result';

const errorText = (error: unknown): string => (error instanceof Error ? error.message : String(error));

/**
 * Starts the TUI console on the current terminal and wires it to the host's supervisor.
 *
 * The renderer never exits on Ctrl+C or signals; the app decides what Ctrl+C means and the host
 * owns signals. Each new server link gets a `subscribe` for every level, and commands and
 * completions travel over it with request ids that the matching result resolves. A fallback on
 * `process` `exit`, `uncaughtException`, and `unhandledRejection` writes the terminal reset
 * sequence and leaves raw mode when `renderer.destroy()` never ran. It does nothing else: the
 * host's own fatal handler kills the child, closes the console, prints the error once, and
 * exits, so a second print or `process.exit` here would race it.
 *
 * @throws Error when the renderer cannot start, for example because OpenTUI's native library
 * is missing. The message names the cause so the host can print it and fall back.
 */
export async function startConsole(options: StartConsoleOptions): Promise<ConsoleHandle> {
    const { supervisor } = options;
    const env = options.env ?? process.env;
    const stdout = options.stdout ?? process.stdout;
    const stdin = options.stdin ?? process.stdin;
    const historyFile = options.historyFile ?? join(env.JSP_DIR ?? 'jsp', '.console_history');

    const history = new CommandHistory();
    let historyWarning: string | undefined;
    try {
        await history.load(historyFile);
    } catch (error) {
        historyWarning = `could not read ${historyFile}: ${errorText(error)}`;
    }

    const theme = resolveTheme({
        noColor: (env.NO_COLOR ?? '') !== '',
        colorDepth: stdout.getColorDepth?.(env) ?? 24
    });

    let renderer: CliRenderer;
    try {
        renderer = await (options.createRenderer ?? createCliRenderer)({
            stdin,
            stdout,
            exitOnCtrlC: false,
            exitSignals: [],
            consoleMode: 'disabled',
            screenMode: 'alternate-screen',
            openConsoleOnError: false,
            useMouse: true
        });
    } catch (error) {
        throw new Error(`The console could not start its renderer: ${errorText(error)}`, { cause: error });
    }

    let closed = false;
    const restoreTerminal = (): void => {
        if (closed) return;
        try {
            stdout.write(TERMINAL_RESET);
            if (stdin.isTTY) stdin.setRawMode(false);
        } catch {
            // The terminal is gone; nothing to restore.
        }
    };
    // Named functions so the host and tests can tell these listeners apart from OpenTUI's.
    const onUncaught = (): void => {
        restoreTerminal();
    };
    const onUnhandledRejection = (): void => {
        restoreTerminal();
    };
    process.on('exit', restoreTerminal);
    process.on('uncaughtException', onUncaught);
    process.on('unhandledRejection', onUnhandledRejection);

    const pending = new Map<string, PendingRequest>();
    let link: ServerLink | undefined;
    let detachLink: (() => void) | undefined;

    const failPending = (reason: string): void => {
        for (const [id, request] of pending) {
            clearTimeout(request.timer);
            request.reject(new Error(reason));
            pending.delete(id);
        }
    };

    function request<T extends ResultType>(type: T, build: (id: string) => ConsoleMessage): Promise<ResultMessage<T>> {
        const target = link;
        if (target === undefined) return Promise.reject(new Error('server is not running'));
        const id = randomUUID();
        return new Promise<ResultMessage<T>>((resolve, reject) => {
            const timer = setTimeout(() => {
                pending.delete(id);
                reject(new Error(`no answer from the server after ${REQUEST_TIMEOUT_MS / 1000} s`));
            }, REQUEST_TIMEOUT_MS);
            pending.set(id, {
                resolve: (message) => {
                    if (message.type === type) resolve(message as ResultMessage<T>);
                    else reject(new Error(`expected ${type}, got ${message.type}`));
                },
                reject,
                timer
            });
            target.send(build(id));
        });
    }

    const app = createApp(
        { renderer, theme, store: new LogStore(), history },
        {
            async onCommand(line): Promise<CommandOutcome> {
                try {
                    const result = await request('command.result', (id) => ({
                        type: 'command',
                        v: PROTOCOL_VERSION,
                        id,
                        line
                    }));
                    return { ok: result.ok, error: result.error };
                } catch (error) {
                    return { ok: false, error: errorText(error) };
                }
            },
            async onComplete(line, cursor): Promise<CompletionResult> {
                if (link === undefined) return { completions: [], replace: '' };
                const result = await request('complete.result', (id) => ({
                    type: 'complete',
                    v: PROTOCOL_VERSION,
                    id,
                    line,
                    cursor
                }));
                return { completions: result.completions, replace: result.replace };
            },
            actions: {
                restart: () => supervisor.restart('console'),
                stop: () => supervisor.stop(),
                forceStop: () => supervisor.forceStop()
            },
            serverName: options.serverName,
            version: options.version
        }
    );
    app.setDisabled(true);
    app.focus();
    if (historyWarning !== undefined) {
        app.applySupervisorEvent({ type: 'supervisor.output', stream: 'stderr', text: historyWarning });
    }

    const attach = (next: ServerLink | undefined): void => {
        detachLink?.();
        detachLink = undefined;
        link = next;
        if (next === undefined) {
            failPending('server link closed');
            app.setDisabled(true);
            return;
        }
        const offMessage = next.onMessage((message) => {
            if (isResult(message)) {
                const waiting = pending.get(message.id);
                if (waiting) {
                    clearTimeout(waiting.timer);
                    pending.delete(message.id);
                    waiting.resolve(message);
                }
            }
            app.applyServerMessage(message);
        });
        const offClose = next.onClose(() => {
            if (link === next) attach(undefined);
        });
        detachLink = () => {
            offMessage();
            offClose();
        };
        next.send({ type: 'subscribe', v: PROTOCOL_VERSION, level: 'silly' });
        app.setDisabled(false);
    };

    const offEvent = supervisor.onEvent((event) => app.applySupervisorEvent(event));
    const offLink = supervisor.onLink(attach);

    return {
        async close() {
            if (closed) return;
            offEvent();
            offLink();
            detachLink?.();
            failPending('console closed');
            app.dispose();
            try {
                await history.save(historyFile);
            } catch {
                // History is a convenience; a failed save must not block the shutdown.
            }
            renderer.destroy();
            await renderer.closed;
            closed = true;
            process.off('exit', restoreTerminal);
            process.off('uncaughtException', onUncaught);
            process.off('unhandledRejection', onUnhandledRejection);
        }
    };
}
