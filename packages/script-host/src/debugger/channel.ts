/**
 * Carries debugger messages between the thread that owns the connection and the engine's thread.
 * The engine's thread blocks while a script is stopped, so its event loop cannot deliver a
 * message: it takes them from a `MessagePort` with `receiveMessageOnPort`, and waits on a shared
 * counter that the connection's side bumps after each message.
 */

import { MessageChannel, receiveMessageOnPort } from 'node:worker_threads';
import type { MessagePort } from 'node:worker_threads';

import type { DebuggerChannel } from './DebugSession';
import type { HostMessage } from './protocol';

/** The words of the shared signal: how many messages were delivered, and whether the connection closed. */
const Signal = { delivered: 0, closed: 1 } as const;

/** A connection to the extension that a bridge can join to, such as a {@link DebuggerSocket}. */
export interface DebuggerConnection {
    onMessage(listener: (message: unknown) => void): void;
    onClose(listener: () => void): void;
    send(message: unknown): void;
    close(): void;
}

/** What the engine's thread needs to build its end; it crosses to a worker in `postMessage`'s transfer list. */
export interface DebuggerChannelEndpoint {
    readonly port: MessagePort;
    readonly signal: SharedArrayBuffer;
}

/**
 * The engine thread's end: a {@link DebuggerChannel} whose `receive` blocks the thread until the
 * connection's side delivers a message or closes.
 */
export class PortDebuggerChannel implements DebuggerChannel {
    private readonly port: MessagePort;
    private readonly signal: Int32Array;

    public constructor(endpoint: DebuggerChannelEndpoint) {
        this.port = endpoint.port;
        this.signal = new Int32Array(endpoint.signal);
    }

    /** Whether the connection's side has closed. Messages it delivered before closing still arrive. */
    public get closed(): boolean {
        return Atomics.load(this.signal, Signal.closed) !== 0;
    }

    /** Posts a message to the connection's side; dropped once it has closed. */
    public send(message: HostMessage): void {
        if (!this.closed) this.port.postMessage(message);
    }

    /** Returns the next message, blocking this thread until one arrives; undefined once the connection has closed. */
    public receive(): unknown {
        for (;;) {
            const seen = Atomics.load(this.signal, Signal.delivered);
            const message = this.poll();
            if (message !== undefined) return message;
            if (this.closed) return undefined;
            Atomics.wait(this.signal, Signal.delivered, seen);
        }
    }

    /** Returns a message that has already arrived, or undefined, without waiting. */
    public poll(): unknown {
        return receiveMessageOnPort(this.port)?.message;
    }

    /** Closes this end, which also tells the connection's side. */
    public close(): void {
        Atomics.store(this.signal, Signal.closed, 1);
        Atomics.notify(this.signal, Signal.delivered);
        this.port.close();
    }
}

/**
 * The connection thread's end of a channel. It delivers the extension's messages to the engine's
 * thread and hands back what the session sends.
 */
export class DebuggerChannelBridge {
    /** The end to pass to the engine's thread, where a {@link PortDebuggerChannel} wraps it. */
    public readonly endpoint: DebuggerChannelEndpoint;
    private readonly port: MessagePort;
    private readonly signal: Int32Array;

    public constructor() {
        const { port1, port2 } = new MessageChannel();
        const signal = new SharedArrayBuffer(8);
        this.port = port1;
        this.signal = new Int32Array(signal);
        this.endpoint = { port: port2, signal };
    }

    /** Whether either end has closed. */
    public get closed(): boolean {
        return Atomics.load(this.signal, Signal.closed) !== 0;
    }

    /** Hands one message from the extension to the engine's thread, waking it if it waits. */
    public deliver(message: unknown): void {
        if (this.closed) return;
        this.port.postMessage(message);
        Atomics.add(this.signal, Signal.delivered, 1);
        Atomics.notify(this.signal, Signal.delivered);
    }

    /** Calls `listener` with each message the session sends, on this thread's event loop. */
    public onMessage(listener: (message: unknown) => void): void {
        this.port.on('message', listener);
    }

    /** Calls `listener` once when the engine's end closes. */
    public onClose(listener: () => void): void {
        this.port.once('close', listener);
    }

    /**
     * Joins a connection to this bridge: the extension's messages go to the engine's thread, the
     * session's go to the extension, and either side closing closes the other.
     */
    public connect(connection: DebuggerConnection): void {
        connection.onMessage((message) => this.deliver(message));
        connection.onClose(() => this.close());
        this.onMessage((message) => connection.send(message));
        this.onClose(() => connection.close());
    }

    /** Tells the engine's thread the connection closed, after the messages already delivered. */
    public close(): void {
        if (this.closed) return;
        Atomics.store(this.signal, Signal.closed, 1);
        Atomics.notify(this.signal, Signal.delivered);
        this.port.close();
    }
}
