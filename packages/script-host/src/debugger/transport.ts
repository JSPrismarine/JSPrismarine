/**
 * The TCP side of the debugger. Like Bedrock Dedicated Server, the host either listens and the
 * extension connects (`/script debugger listen`, the extension's `connect` mode), or connects to
 * an extension that listens (`/script debugger connect`, its `listen` mode). See the extension's
 * `Session.listen` and `Session.connect` in `src/session.ts`.
 */

import { isIP } from 'node:net';
import { connect, createServer } from 'node:net';
import type { AddressInfo, Server, Socket } from 'node:net';

import { DebuggerFramingError, FrameDecoder, encodeFrame } from './framing';
import { DEFAULT_DEBUGGER_PORT, DebuggerMessages } from './protocol';

/** Why the transport refused to listen or a connection failed. */
export class DebuggerTransportError extends Error {
    public override readonly name = 'DebuggerTransportError';
}

/** The address a listener binds when none is given, as `script-debugger-listen-address` defaults. */
export const DEFAULT_LISTEN_ADDRESS = '127.0.0.1';

/**
 * Whether an address only reaches this machine: `localhost`, `127.0.0.0/8`, `::1`, or an IPv4
 * loopback address mapped into IPv6.
 */
export const isLoopbackAddress = (address: string): boolean => {
    const host = address.startsWith('[') && address.endsWith(']') ? address.slice(1, -1) : address;
    if (host.toLowerCase() === 'localhost') return true;
    if (isIP(host) === 4) return host.startsWith('127.');
    if (isIP(host) === 6) {
        const lower = host.toLowerCase();
        return lower === '::1' || lower === '0:0:0:0:0:0:0:1' || lower.startsWith('::ffff:127.');
    }
    return false;
};

/**
 * Applies Bedrock Dedicated Server's rule for listeners: one on an address other machines can reach
 * needs a passcode.
 * @throws {DebuggerTransportError} With the server's message when the address is not loopback and the passcode is empty.
 */
export const checkListenAddress = (address: string, passcode: string | undefined): void => {
    if (!isLoopbackAddress(address) && (passcode ?? '') === '') {
        throw new DebuggerTransportError(DebuggerMessages.nonLoopbackWithoutPasscode(address));
    }
};

/** One TCP connection to the extension, framed in both directions. */
export class DebuggerSocket {
    private readonly socket: Socket;
    private readonly decoder = new FrameDecoder();
    private readonly messageListeners: ((message: unknown) => void)[] = [];
    private readonly closeListeners: ((error: Error | undefined) => void)[] = [];
    private closedValue = false;

    /** Wraps a connected socket. */
    public constructor(socket: Socket) {
        this.socket = socket;
        socket.setNoDelay(true);
        socket.on('data', (chunk: Buffer) => {
            let messages: unknown[];
            try {
                messages = this.decoder.push(chunk);
            } catch (error) {
                this.finish(error instanceof DebuggerFramingError ? error : new DebuggerFramingError(String(error)));
                return;
            }
            for (const message of messages) for (const listener of this.messageListeners) listener(message);
        });
        socket.on('error', (error) => this.finish(error));
        socket.on('close', () => this.finish(undefined));
    }

    /** Whether the connection has closed. */
    public get closed(): boolean {
        return this.closedValue;
    }

    /** The extension's end of the connection: its IP address and port. */
    public get peer(): { readonly address: string; readonly port: number } {
        return { address: this.socket.remoteAddress ?? '', port: this.socket.remotePort ?? 0 };
    }

    /** Calls `listener` with each message the extension sends, in order. */
    public onMessage(listener: (message: unknown) => void): void {
        this.messageListeners.push(listener);
    }

    /** Calls `listener` once when the connection closes, with the error that closed it if any. */
    public onClose(listener: (error: Error | undefined) => void): void {
        if (this.closedValue) listener(undefined);
        else this.closeListeners.push(listener);
    }

    /** Sends one message. */
    public send(message: unknown): void {
        if (!this.closedValue) this.socket.write(encodeFrame(message));
    }

    /**
     * Closes the connection once what was sent has gone. It destroys the socket then, rather than
     * only ending its side, so the close completes even when the peer keeps its own side open.
     */
    public close(): void {
        this.socket.destroySoon();
    }

    private finish(error: Error | undefined): void {
        if (this.closedValue) return;
        this.closedValue = true;
        this.socket.destroy();
        for (const listener of this.closeListeners.splice(0)) listener(error);
    }
}

/** Where to listen for the extension, and the passcode a non-loopback address requires. */
export interface ListenOptions {
    readonly port?: number;
    readonly address?: string;
    readonly passcode?: string;
}

/** A listener waiting for the extension to connect. It takes one connection, then stops listening. */
export interface DebuggerListener {
    /** The address and port it listens on, which tells the port when 0 asked for any. */
    readonly address: AddressInfo;
    /** The connection, once the extension makes it; rejected when the listener closes first. */
    readonly connection: Promise<DebuggerSocket>;
    /** Stops waiting. */
    close(): void;
}

/**
 * Listens for the extension, as `/script debugger listen` does.
 * @throws {DebuggerTransportError} When the address is not loopback and no passcode is set, or it cannot listen.
 */
export const listenForDebugger = async (options: ListenOptions = {}): Promise<DebuggerListener> => {
    const host = options.address ?? DEFAULT_LISTEN_ADDRESS;
    checkListenAddress(host, options.passcode);
    const server: Server = createServer();
    let settle: { resolve(socket: DebuggerSocket): void; reject(error: Error): void } | undefined;
    const connection = new Promise<DebuggerSocket>((resolve, reject) => {
        settle = { resolve, reject };
    });
    // A caller that never awaits the connection still sees a closed listener as handled.
    connection.catch(() => undefined);
    server.on('connection', (socket) => {
        server.close();
        settle?.resolve(new DebuggerSocket(socket));
    });
    await new Promise<void>((resolve, reject) => {
        server.once('error', (error) => reject(new DebuggerTransportError(error.message)));
        server.listen(options.port ?? DEFAULT_DEBUGGER_PORT, host, resolve);
    });
    const address = server.address();
    if (address === null || typeof address === 'string')
        throw new DebuggerTransportError('The listener has no TCP address');
    return {
        address,
        connection,
        close: () => {
            server.close();
            settle?.reject(new DebuggerTransportError('The debugger listener closed'));
        }
    };
};

/** Where an extension in `listen` mode waits. */
export interface ConnectOptions {
    readonly host?: string;
    readonly port?: number;
}

/**
 * Connects to an extension that listens, as `/script debugger connect` does.
 * @throws {DebuggerTransportError} When the connection fails.
 */
export const connectToDebugger = (options: ConnectOptions = {}): Promise<DebuggerSocket> =>
    new Promise((resolve, reject) => {
        const socket = connect({ host: options.host ?? 'localhost', port: options.port ?? DEFAULT_DEBUGGER_PORT });
        socket.once('connect', () => {
            socket.removeAllListeners('error');
            resolve(new DebuggerSocket(socket));
        });
        socket.once('error', (error) => reject(new DebuggerTransportError(error.message)));
    });
