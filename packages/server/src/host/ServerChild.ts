import type { ConsoleMessage, MessageLink, ServerMessage } from '@jsprismarine/console-protocol';
import { isServerMessage, subprocessLink } from '@jsprismarine/console-protocol';
import type { ChildProcess } from 'node:child_process';
import { spawn } from 'node:child_process';
import type { Readable } from 'node:stream';

/** A line of the child's stdout or stderr, without its line terminator. */
export type OutputListener = (stream: 'stdout' | 'stderr', text: string) => void;

/** How the child ended, straight from the process `exit` event. */
export type ExitListener = (code: number | null, signal: NodeJS.Signals | null) => void;

/**
 * How to reach this program again in a new process: the Node flags and the script argument
 * that go before the user's own arguments.
 */
export interface Launch {
    /** Node flags, such as `--import tsx` in development. */
    execArgv: readonly string[];
    /** The script to run, or nothing when the executable is the program itself. */
    scriptArgs: readonly string[];
}

/** The timer functions {@link spawnServerChild} schedules its escalation with. */
export type Timers = Pick<typeof globalThis, 'setTimeout' | 'clearTimeout'>;

/** Options for {@link spawnServerChild}. */
export interface ServerChildOptions {
    /** The user's command-line arguments, forwarded ahead of `--role server`. */
    userArgs: readonly string[];
    /** Defaults to {@link currentLaunch}. */
    launch?: Launch;
    /** Defaults to the host's working directory. */
    cwd?: string;
    /** Defaults to the host's environment. */
    env?: NodeJS.ProcessEnv;
    /** How long {@link ServerChild.stop} waits after the `shutdown` message before SIGTERM; defaults to 1000. */
    shutdownGraceMs?: number;
    /** How long {@link ServerChild.stop} waits after SIGTERM before SIGKILL; defaults to 10000. */
    killGraceMs?: number;
    /** Defaults to the global timers. */
    timers?: Timers;
}

/** One generation of the server process, as the supervisor sees it. */
export interface ServerChild {
    /** Undefined when the spawn itself failed. */
    readonly pid: number | undefined;
    /** The IPC link to this child. It closes when the child exits. */
    readonly link: MessageLink<ServerMessage, ConsoleMessage>;
    /** Receives each line the child writes to its stdout or stderr. */
    onOutput(listener: OutputListener): () => void;
    /** Receives the exit code and signal once the child is gone. */
    onExit(listener: ExitListener): () => void;
    /**
     * Asks the child to stop: first the `shutdown` message, which also works on Windows, then
     * SIGTERM after the shutdown grace period, then SIGKILL after the kill grace period.
     * Calling it again has no effect.
     */
    stop(): void;
    /** Kills the child outright with SIGKILL. */
    kill(): void;
}

/**
 * Works out how to spawn this program again. Under Node the child runs the same script with
 * the same Node flags. In a single-executable application the binary is the program: there is
 * no script argument, Node flags are baked into the executable, and the child reads its
 * arguments from `process.argv.slice(2)` just like a script would.
 */
export const currentLaunch = async (): Promise<Launch> => {
    const { isSea } = await import('node:sea');
    if (isSea()) return { execArgv: [], scriptArgs: [] };
    const script = process.argv[1];
    return { execArgv: process.execArgv, scriptArgs: script === undefined ? [] : [script] };
};

const forwardLines = (stream: Readable | null, emit: (text: string) => void): void => {
    if (!stream) return;
    let rest = '';
    stream.setEncoding('utf8');
    stream.on('data', (chunk: string) => {
        const lines = (rest + chunk).split('\n');
        rest = lines.pop() ?? '';
        for (const line of lines) emit(line.endsWith('\r') ? line.slice(0, -1) : line);
    });
    stream.on('end', () => {
        if (rest.length > 0) emit(rest);
        rest = '';
    });
};

/**
 * Spawns one server child with `--role server` appended to the user's arguments and an IPC
 * channel for the console protocol. Stdin is closed so only the host ever reads the terminal;
 * stdout and stderr are piped and surface line by line through {@link ServerChild.onOutput}.
 */
export const spawnServerChild = async (options: ServerChildOptions): Promise<ServerChild> => {
    const launch = options.launch ?? (await currentLaunch());
    const timers = options.timers ?? globalThis;
    const shutdownGraceMs = options.shutdownGraceMs ?? 1000;
    const killGraceMs = options.killGraceMs ?? 10_000;

    const child: ChildProcess = spawn(
        process.execPath,
        [...launch.execArgv, ...launch.scriptArgs, ...options.userArgs, '--role', 'server'],
        {
            cwd: options.cwd,
            env: options.env ?? process.env,
            stdio: ['ignore', 'pipe', 'pipe', 'ipc']
        }
    );
    const link = subprocessLink<ServerMessage, ConsoleMessage>(child, { validate: isServerMessage });

    const outputListeners = new Set<OutputListener>();
    const exitListeners = new Set<ExitListener>();
    let alive = true;
    let stopping = false;
    let termTimer: ReturnType<typeof setTimeout> | undefined;
    let killTimer: ReturnType<typeof setTimeout> | undefined;

    forwardLines(child.stdout, (text) => {
        for (const listener of outputListeners) listener('stdout', text);
    });
    forwardLines(child.stderr, (text) => {
        for (const listener of outputListeners) listener('stderr', text);
    });

    child.on('exit', (code, signal) => {
        alive = false;
        timers.clearTimeout(termTimer);
        timers.clearTimeout(killTimer);
        for (const listener of exitListeners) listener(code, signal);
    });
    // Without a listener a failed spawn or a failed IPC write would be thrown asynchronously;
    // both end in an 'exit' event, which is where the supervisor learns about them.
    child.on('error', () => {});

    const kill = (): void => {
        if (alive) child.kill('SIGKILL');
    };

    return {
        pid: child.pid,
        link,
        onOutput(listener) {
            outputListeners.add(listener);
            return () => {
                outputListeners.delete(listener);
            };
        },
        onExit(listener) {
            exitListeners.add(listener);
            return () => {
                exitListeners.delete(listener);
            };
        },
        stop() {
            if (!alive || stopping) return;
            stopping = true;
            const asked = link.send({ type: 'shutdown', v: 1 });
            const term = (): void => {
                if (alive) child.kill('SIGTERM');
                killTimer = timers.setTimeout(kill, killGraceMs);
            };
            if (asked) termTimer = timers.setTimeout(term, shutdownGraceMs);
            else term();
        },
        kill
    };
};
