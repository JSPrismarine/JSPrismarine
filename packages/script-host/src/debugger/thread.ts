/**
 * The debugger's sockets on a thread of their own. A stopped script blocks the thread its engine
 * runs on, which is the world's thread, so that thread cannot read a socket while the extension
 * inspects the stopped script. The socket thread listens or connects, and hands each connection to
 * the engine's thread as a {@link DebuggerChannelEndpoint}, which a {@link PortDebuggerChannel}
 * reads there.
 */

import { Worker } from 'node:worker_threads';

import type { DebuggerChannelEndpoint, PortDebuggerChannel } from './channel';
import type { ConnectOptions, ListenOptions } from './transport';
import { DebuggerTransportError } from './transport';

/** A connection the socket thread made or accepted. */
export interface DebuggerThreadConnection {
    /** The end of the channel to the extension that a {@link PortDebuggerChannel} wraps. */
    readonly endpoint: DebuggerChannelEndpoint;
    /** The extension's IP address. */
    readonly address: string;
    /** The extension's port. */
    readonly port: number;
}

/** What the socket thread tells the thread that started it. Both run on that thread's event loop. */
export interface DebuggerThreadEvents {
    /** A connection to the extension arrived; earlier connections have closed. */
    connected(connection: DebuggerThreadConnection): void;
    /** The extension sent a message, or the connection closed, so a session has something to read. */
    activity(): void;
}

/** A request to the socket thread. */
export type DebuggerThreadRequest =
    | { readonly id: number; readonly op: 'listen'; readonly options: ListenOptions }
    | { readonly id: number; readonly op: 'connect'; readonly options: ConnectOptions }
    | { readonly id: number; readonly op: 'close' };

/** A message from the socket thread. */
export type DebuggerThreadMessage =
    | { readonly kind: 'reply'; readonly id: number; readonly port?: number; readonly error?: string }
    | { readonly kind: 'connected'; readonly connection: DebuggerThreadConnection }
    | { readonly kind: 'activity' };

/** The worker's module beside this one: the source in a checkout, the build otherwise. */
const workerUrl = (): URL =>
    new URL(import.meta.url.endsWith('.ts') ? './connectionWorker.ts' : './connectionWorker.js', import.meta.url);

/**
 * The flags a worker starts with. Node strips a source worker's types itself, and the repository's
 * resolver adds the extensionless imports the source uses, unless a loader is already there.
 */
const workerExecArgv = (): string[] => {
    if (!import.meta.url.endsWith('.ts')) return process.execArgv;
    const loaderFlags = ['--import', '--loader', '--experimental-loader'];
    if (process.execArgv.some((argument) => loaderFlags.some((flag) => argument.startsWith(flag)))) {
        return process.execArgv;
    }
    const resolver = new URL('../../../../scripts/native-typescript-loader.mjs', import.meta.url).href;
    return [...process.execArgv, '--import', resolver];
};

const isThreadMessage = (message: unknown): message is DebuggerThreadMessage =>
    typeof message === 'object' && message !== null && 'kind' in message;

/**
 * The debugger's socket thread. It holds at most one listener and one connection: a new `listen`
 * or `connect` closes both first, as Bedrock Dedicated Server's commands replace the debugger
 * they find. The thread starts with the first request and does not keep the process alive.
 */
export class DebuggerThread {
    private readonly events: DebuggerThreadEvents;
    private worker: Worker | undefined;
    private nextId = 1;
    private readonly pending = new Map<number, { resolve(port: number): void; reject(error: Error): void }>();

    public constructor(events: DebuggerThreadEvents) {
        this.events = events;
    }

    /**
     * Listens for the extension, as `/script debugger listen` does.
     * @returns The port it listens on, which tells the port when 0 asked for any.
     * @throws {DebuggerTransportError} With Bedrock Dedicated Server's message for an address other
     *   than loopback without a passcode, or why the port could not be opened.
     */
    public listen(options: ListenOptions): Promise<number> {
        return this.request((id) => ({ id, op: 'listen', options }));
    }

    /**
     * Connects to an extension that listens, as `/script debugger connect` does. The
     * {@link DebuggerThreadEvents.connected} event comes before this resolves.
     * @throws {DebuggerTransportError} When the connection fails.
     */
    public async connect(options: ConnectOptions): Promise<void> {
        await this.request((id) => ({ id, op: 'connect', options }));
    }

    /** Closes the listener and the connection; the channel's end on this thread then reads as closed. */
    public async close(): Promise<void> {
        if (this.worker === undefined) return;
        await this.request((id) => ({ id, op: 'close' }));
    }

    /** Stops the thread, closing whatever it held. */
    public async terminate(): Promise<void> {
        const worker = this.worker;
        this.worker = undefined;
        for (const { reject } of this.pending.values())
            reject(new DebuggerTransportError('The debugger thread stopped'));
        this.pending.clear();
        if (worker !== undefined) await worker.terminate();
    }

    private request(build: (id: number) => DebuggerThreadRequest): Promise<number> {
        const id = this.nextId++;
        const reply = new Promise<number>((resolve, reject) => this.pending.set(id, { resolve, reject }));
        this.start().postMessage(build(id));
        return reply;
    }

    private start(): Worker {
        if (this.worker !== undefined) return this.worker;
        const worker = new Worker(workerUrl(), { execArgv: workerExecArgv() });
        worker.unref();
        worker.on('message', (message: unknown) => this.receive(message));
        worker.on('error', (error) => this.fail(worker, error instanceof Error ? error : new Error(String(error))));
        worker.on('exit', (code) => this.fail(worker, new Error(`The debugger thread exited with code ${code}`)));
        this.worker = worker;
        return worker;
    }

    private receive(message: unknown): void {
        if (!isThreadMessage(message)) return;
        switch (message.kind) {
            case 'connected':
                this.events.connected(message.connection);
                return;
            case 'activity':
                this.events.activity();
                return;
            case 'reply': {
                const waiter = this.pending.get(message.id);
                this.pending.delete(message.id);
                if (message.error === undefined) waiter?.resolve(message.port ?? 0);
                else waiter?.reject(new DebuggerTransportError(message.error));
                return;
            }
        }
    }

    /** Rejects what waited on a worker that failed or exited, so the next request starts another. */
    private fail(worker: Worker, error: Error): void {
        if (this.worker !== worker) return;
        this.worker = undefined;
        for (const { reject } of this.pending.values()) reject(error);
        this.pending.clear();
    }
}
