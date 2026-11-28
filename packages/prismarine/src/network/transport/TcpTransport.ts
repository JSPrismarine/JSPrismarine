import type { IncomingMessage, Server as HttpServer, ServerResponse } from 'node:http';
import { createServer as createHttpServer } from 'node:http';
import type { Server as NetServer, Socket } from 'node:net';
import { createServer } from 'node:net';

import type { Logger } from '@jsprismarine/logger';
import { InetAddress } from '@jsprismarine/raknet';

import type { ConnectionId, ConnectionIds } from './ConnectionId';
import { createCfb8 } from './cfb8';
import type { StreamCipher } from './cfb8';
import { KeyedTransport } from './KeyedTransport';
import { framed, MAX_JAVA_FRAME, JavaFrameReader } from '@jsprismarine/protocol/java/wire/frames';
import { TransportNames } from './Transport';
import type { TransportCapabilities, TransportConnection } from './Transport';

/** What answers an HTTP request that reached the Java port. */
export type JavaPortHttpHandler = (request: IncomingMessage, response: ServerResponse) => void;

/** The openings of the HTTP requests the Java port answers: a download and its headers. */
const HTTP_OPENINGS = ['GET /', 'HEAD /'].map((opening) => Buffer.from(opening, 'latin1'));

/**
 * What a connection's opening bytes are: an HTTP request, a Java client, or too few bytes to tell.
 * A Java client opens with a frame length then the handshake's packet id 0, or the legacy ping's
 * 0xFE, so a connection that opens with `GET /` or `HEAD /` is never a Java client. Bytes that are
 * still the start of one of those openings, such as `GE`, need more to tell.
 */
export const protocolOf = (opening: Buffer): 'http' | 'java' | 'undecided' => {
    let undecided = false;
    for (const http of HTTP_OPENINGS) {
        const length = Math.min(opening.byteLength, http.byteLength);
        if (!opening.subarray(0, length).equals(http.subarray(0, length))) continue;
        if (opening.byteLength >= http.byteLength) return 'http';
        undecided = true;
    }
    return undecided ? 'undecided' : 'java';
};

const TCP_CAPABILITIES: TransportCapabilities = {
    // Java Edition encrypts above the transport, after its login.
    encrypted: false,
    reliableOrdered: true,
    maxFrameSize: MAX_JAVA_FRAME
};

/** One Java Edition client's socket, which carries frames behind their lengths. */
export class TcpTransportConnection implements TransportConnection {
    public readonly address: InetAddress;
    public readonly capabilities = TCP_CAPABILITIES;
    public readonly transport = TransportNames.java;

    /** The stream cipher each way, once {@link TcpTransportConnection.encrypt} turned it on. */
    private cipher: { readonly out: StreamCipher; readonly in: StreamCipher } | undefined;

    public constructor(
        public readonly id: ConnectionId,
        private readonly socket: Socket
    ) {
        this.address = new InetAddress(socket.remoteAddress ?? '0.0.0.0', socket.remotePort ?? 0);
    }

    /** Writes one frame behind its length. TCP sends at once, so `immediate` changes nothing. */
    public sendFrame(payload: Buffer): void {
        if (this.socket.destroyed || this.socket.writableEnded) return;
        const bytes = framed(payload);
        this.socket.write(this.cipher === undefined ? bytes : this.cipher.out.update(bytes));
    }

    /**
     * Encrypts the stream both ways from here on, with AES-128 in CFB8 mode and the shared secret
     * as both key and IV, as Java Edition does once its login has agreed on the secret. Frames are
     * framed first and encrypted after, so the lengths are encrypted too.
     * @param secret - The sixteen-byte shared secret.
     */
    public encrypt(secret: Buffer): void {
        this.cipher = {
            out: createCfb8('encrypt', secret, secret),
            in: createCfb8('decrypt', secret, secret)
        };
    }

    /** The bytes the socket read, decrypted once the stream is encrypted. */
    public decrypt(chunk: Buffer): Buffer {
        return this.cipher === undefined ? chunk : this.cipher.in.update(chunk);
    }

    /**
     * Ends the stream once what was written has been sent, and settles when the socket closes,
     * so a goodbye written just before reaches the client.
     */
    public close(): Promise<void> {
        if (this.socket.destroyed) return Promise.resolve();
        return new Promise((resolve) => {
            this.socket.once('close', () => resolve());
            this.socket.end();
        });
    }
}

/**
 * Java Edition's transport: a TCP listener whose connections carry Java frames.
 *
 * A frame reaches listeners without its length; compression and encryption, which Java turns
 * on during login, belong to the layer above, as Bedrock's batch and cipher do.
 */
export class TcpTransport extends KeyedTransport<TcpTransportConnection, Socket> {
    private readonly listener: NetServer;
    /** Every open socket, which closing the transport destroys. */
    private readonly sockets = new Set<Socket>();
    /** What answers HTTP on the port, when anything does. */
    private readonly http?: HttpServer;

    /**
     * @param ids - The allocator every transport of the server shares.
     * @param log - Where a connection that breaks the framing is reported.
     * @param http - Answers a connection that opens with an HTTP request, such as a Java client's
     *   download of the server's resource pack, on the same port; without it, every connection is
     *   a Java client's.
     */
    public constructor(
        ids: ConnectionIds,
        private readonly log: Pick<Logger, 'debug'>,
        http?: JavaPortHttpHandler
    ) {
        super(ids);
        if (http !== undefined) this.http = createHttpServer(http);
        this.listener = createServer((socket) => this.accepted(socket));
    }

    /**
     * Listens on a TCP port.
     * @param address - The address to bind.
     * @param port - The port, or 0 for one the system picks.
     * @returns A promise that settles once the socket listens, or rejects with why it cannot.
     */
    public listen(address: string, port: number): Promise<void> {
        return new Promise((resolve, reject) => {
            const failed = (error: Error) => reject(error);
            this.listener.once('error', failed);
            this.listener.listen(port, address, () => {
                this.listener.off('error', failed);
                resolve();
            });
        });
    }

    /** The port the listener is bound to, which is the system's pick when it was asked for 0. */
    public port(): number | undefined {
        const bound = this.listener.address();
        return typeof bound === 'object' && bound !== null ? bound.port : undefined;
    }

    /** Stops listening and drops every connection. */
    public close(): void {
        this.listener.close();
        for (const socket of this.sockets) socket.destroy();
    }

    private accepted(socket: Socket): void {
        socket.setNoDelay(true);
        this.sockets.add(socket);
        socket.once('close', () => this.sockets.delete(socket));
        // From the start, so a reset before any byte arrives is logged rather than thrown.
        // A reset or a timeout is followed by `close`, which forgets a Java connection.
        socket.on('error', (error) => this.log.debug(`TCP connection from ${socket.remoteAddress}: ${error.message}`));
        const http = this.http;
        if (http === undefined) {
            this.acceptJava(socket);
            return;
        }
        // The opening bytes tell an HTTP request from a Java client; they go back to whichever reads on.
        let opening = Buffer.alloc(0);
        const read = (chunk: Buffer): void => {
            opening = Buffer.concat([opening, chunk]);
            const protocol = protocolOf(opening);
            if (protocol === 'undecided') return;
            socket.off('data', read);
            if (protocol === 'java') {
                this.acceptJava(socket, opening);
                return;
            }
            socket.pause();
            socket.unshift(opening);
            http.emit('connection', socket);
            socket.resume();
        };
        socket.on('data', read);
    }

    /** Reads a Java client's frames off a socket, its first bytes included when they were already read. */
    private acceptJava(socket: Socket, first?: Buffer): void {
        const connection = this.accept(socket, (id) => new TcpTransportConnection(id, socket));
        if (connection === undefined) return;

        const reader = new JavaFrameReader();
        const read = (chunk: Buffer): void => {
            const frames = reader.push(connection.decrypt(chunk));
            if ('malformed' in frames) {
                this.log.debug(`Java connection ${connection.id} sent ${frames.malformed}; closing it`);
                socket.destroy();
                return;
            }
            for (const frame of frames.frames) this.receive(socket, frame);
        };
        socket.on('data', read);
        if (first !== undefined) read(first);
        socket.once('close', () => this.forget(socket, 'closed'));
    }
}
