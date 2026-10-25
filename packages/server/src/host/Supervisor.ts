import type {
    ConsoleMessage,
    MessageLink,
    ServerMessage,
    SupervisorEvent,
    SupervisorState
} from '@jsprismarine/console-protocol';
import type { ServerChild } from './ServerChild';

/** Options for {@link Supervisor}. */
export interface SupervisorOptions {
    /** Spawns one generation of the server child. Injected so tests can supply a fake. */
    spawnChild: () => Promise<ServerChild>;
    /** Ends the host process once the server is gone for good; defaults to `process.exit`. */
    exit?: (code: number) => void | Promise<void>;
    /**
     * Whether something, such as the watcher, will call {@link Supervisor.restart} after a
     * crash. When false a crash ends the host with the child's exit code instead of waiting
     * for a restart that never comes. Defaults to false.
     */
    canRestart?: boolean;
}

/** The host-side link to the current server generation. */
export type ServerLink = MessageLink<ServerMessage, ConsoleMessage>;

const HOST_SIGNALS = ['SIGINT', 'SIGTERM', 'SIGHUP'] as const;

/** A signal the host handles itself rather than letting it end the process. */
export type HostSignal = (typeof HOST_SIGNALS)[number];

/** Something that raises the host signals, normally `process`. */
export interface SignalSource {
    on(signal: HostSignal, listener: () => void): unknown;
    off(signal: HostSignal, listener: () => void): unknown;
}

/**
 * Owns the server child across restarts and is the single source of `SupervisorEvent`s.
 *
 * One child runs at a time. A restart asks the running child to stop and spawns the next
 * generation only after it has exited, so two servers never fight over the port or the
 * terminal. A child that exits with a non-zero code on its own is treated as a crash, usually a
 * half-finished edit under `--watch`: with `canRestart` set the supervisor reports `crashed`,
 * then `waiting`, and stays up for the watcher or the console to call {@link restart}. A clean
 * exit, any exit after {@link stop}, or a crash with nothing to restart it ends the host with
 * the child's exit code, so wrappers that watch the exit code keep working. A spawn that is
 * rejected, or a child killed by a signal, counts as exit code 1.
 */
export class Supervisor {
    private readonly eventListeners = new Set<(event: SupervisorEvent) => void>();
    private readonly linkListeners = new Set<(link: ServerLink) => void>();
    private readonly exit: (code: number) => void | Promise<void>;
    private readonly canRestart: boolean;
    private child: ServerChild | undefined;
    private spawning = false;
    private restartQueued = false;
    private shuttingDown = false;
    private forced = false;
    private currentState: SupervisorState = 'stopped';
    private currentGeneration = 0;

    public constructor(private readonly options: SupervisorOptions) {
        this.exit = options.exit ?? ((code) => process.exit(code));
        this.canRestart = options.canRestart ?? false;
    }

    /** The last state reported through {@link onEvent}. */
    public get state(): SupervisorState {
        return this.currentState;
    }

    /** How many children have been spawned so far; the first is generation 1. */
    public get generation(): number {
        return this.currentGeneration;
    }

    /** The link to the current child, or undefined between generations. */
    public get serverLink(): ServerLink | undefined {
        return this.child?.link;
    }

    /** Subscribes to every supervisor event. */
    public onEvent(listener: (event: SupervisorEvent) => void): () => void {
        this.eventListeners.add(listener);
        return () => {
            this.eventListeners.delete(listener);
        };
    }

    /**
     * Runs the listener with the link of each new generation as it is spawned. A frontend
     * subscribes here and attaches its message listeners to every link, because a link dies
     * with its child.
     */
    public onLink(listener: (link: ServerLink) => void): () => void {
        this.linkListeners.add(listener);
        return () => {
            this.linkListeners.delete(listener);
        };
    }

    /** Spawns the next generation. Does nothing while a child is running or being spawned. */
    public async start(): Promise<void> {
        if (this.child || this.spawning) return;
        this.spawning = true;
        this.currentGeneration += 1;
        this.setState('starting');

        let child: ServerChild;
        try {
            child = await this.options.spawnChild();
        } catch (error) {
            // Working out how to launch the child failed, for instance `import('node:sea')`
            // in a build that lacks it. Treat it like a child that crashed at once so the
            // host either exits or, under the watcher, waits for a fix.
            this.spawning = false;
            this.emit({
                type: 'supervisor.output',
                stream: 'stderr',
                text: error instanceof Error ? error.message : String(error)
            });
            this.onChildExit(1, null);
            return;
        }
        this.spawning = false;
        this.child = child;
        for (const listener of this.linkListeners) listener(child.link);

        child.link.onMessage((message) => {
            if (message.type !== 'lifecycle' || child !== this.child) return;
            if (message.state === 'running') this.setState('running');
            else if (message.state === 'stopping' && this.currentState !== 'stopping') this.setState('stopping');
        });
        child.onOutput((stream, text) => this.emit({ type: 'supervisor.output', stream, text }));
        child.onExit((code, signal) => this.onChildExit(code, signal));

        // Requests that arrived while the spawn was in flight.
        if (this.shuttingDown || this.restartQueued) this.stopChild();
    }

    /**
     * Stops the running child and spawns a new one once it has exited; starts one when none is
     * running. `reason` names what asked for it; the supervisor does not report it itself,
     * because the watcher already raised `supervisor.changed` for the path.
     */
    // biome-ignore lint/correctness/noUnusedFunctionParameters: the parameter is part of the restart action contract shared with the console
    public restart(reason: string): void {
        if (this.shuttingDown) return;
        if (this.child || this.spawning) {
            this.restartQueued = true;
            this.stopChild();
            return;
        }
        void this.start();
    }

    /** Stops the child and, once it has exited, ends the host with its exit code. */
    public stop(): void {
        this.shuttingDown = true;
        this.restartQueued = false;
        if (this.child || this.spawning) {
            this.stopChild();
            return;
        }
        void this.exit(0);
    }

    /** Kills the child without waiting for it; the host then exits with code 1. */
    public forceStop(): void {
        this.shuttingDown = true;
        this.restartQueued = false;
        this.forced = true;
        if (this.child) {
            this.child.kill();
            return;
        }
        if (!this.spawning) void this.exit(1);
    }

    /**
     * Routes `SIGINT`, `SIGTERM`, and `SIGHUP` to {@link stop}, and a second signal to
     * {@link forceStop}. The host must survive these because outside raw mode the terminal
     * sends them to the whole foreground process group, and `SIGHUP` because the PTY can hang
     * up while the child still lives.
     *
     * @returns A function that removes the handlers again.
     */
    public handleSignals(source: SignalSource = process): () => void {
        const onSignal = (): void => {
            if (this.shuttingDown) this.forceStop();
            else this.stop();
        };
        for (const signal of HOST_SIGNALS) source.on(signal, onSignal);
        return () => {
            for (const signal of HOST_SIGNALS) source.off(signal, onSignal);
        };
    }

    private stopChild(): void {
        if (!this.child) return;
        if (this.currentState !== 'stopping') this.setState('stopping');
        this.child.stop();
    }

    private onChildExit(code: number | null, signal: NodeJS.Signals | null): void {
        this.child = undefined;

        if (this.restartQueued && !this.shuttingDown) {
            this.restartQueued = false;
            this.setState('restarting', code, signal);
            void this.start();
            return;
        }

        if (this.shuttingDown || code === 0 || code === null || !this.canRestart) {
            this.setState('stopped', code, signal);
            void this.exit(this.forced ? 1 : (code ?? 1));
            return;
        }

        this.setState('crashed', code, signal);
        this.setState('waiting', code, signal);
    }

    private setState(state: SupervisorState, code?: number | null, signal?: NodeJS.Signals | null): void {
        this.currentState = state;
        this.emit({ type: 'supervisor.state', state, code, signal, generation: this.currentGeneration });
    }

    /**
     * Delivers an event to every {@link onEvent} listener. The watcher reports through here so
     * a frontend subscribes to one source for both the child's and the watcher's state. A
     * `supervisor.watching` event picks up `canRestart` on the way, so a frontend knows whether
     * a restart it asks for will happen.
     */
    public emit(event: SupervisorEvent): void {
        const outgoing = event.type === 'supervisor.watching' ? { ...event, canRestart: this.canRestart } : event;
        for (const listener of this.eventListeners) listener(outgoing);
    }
}
