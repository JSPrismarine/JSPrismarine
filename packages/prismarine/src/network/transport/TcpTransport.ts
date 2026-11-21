import type { Cipheriv, Decipheriv } from 'node:crypto';
import { createCipheriv, createDecipheriv } from 'node:crypto';
import type { Server as NetServer, Socket } from 'node:net';
import { createServer } from 'node:net';

import type { Logger } from '@jsprismarine/logger';
import { InetAddress } from '@jsprismarine/raknet';

import type { ConnectionId, ConnectionIds } from './ConnectionId';
import { KeyedTransport } from './KeyedTransport';
import { framed, MAX_TCP_FRAME, TcpFrameReader } from './tcpFrames';
import { TransportNames } from './Transport';
import type { TransportCapabilities, TransportConnection } from './Transport';

const TCP_CAPABILITIES: TransportCapabilities = {
    // Java Edition encrypts above the transport, after its login.
    encrypted: false,
    reliableOrdered: true,
    maxFrameSize: MAX_TCP_FRAME
};

/** One Java Edition client's socket, which carries frames behind their lengths. */
export class TcpTransportConnection implements TransportConnection {
    public readonly address: InetAddress;
    public readonly capabilities = TCP_CAPABILITIES;
    public readonly transport = TransportNames.tcp;

    /** The stream cipher each way, once {@link TcpTransportConnection.encrypt} turned it on. */
    private cipher: { readonly out: Cipheriv; readonly in: Decipheriv } | undefined;

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
            out: createCipheriv('aes-128-cfb8', secret, secret),
            in: createDecipheriv('aes-128-cfb8', secret, secret)
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

    /**
     * @param ids - The allocator every transport of the server shares.
     * @param log - Where a connection that breaks the framing is reported.
     */
    public constructor(
        ids: ConnectionIds,
        private readonly log: Pick<Logger, 'debug'>
    ) {
        super(ids);
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
        const connection = this.accept(socket, (id) => new TcpTransportConnection(id, socket));
        if (connection === undefined) return;

        const reader = new TcpFrameReader();
        socket.on('data', (chunk: Buffer) => {
            const read = reader.push(connection.decrypt(chunk));
            if ('malformed' in read) {
                this.log.debug(`Java connection ${connection.id} sent ${read.malformed}; closing it`);
                socket.destroy();
                return;
            }
            for (const frame of read.frames) this.receive(socket, frame);
        });
        // A reset or a timeout is followed by `close`, which forgets the connection.
        socket.on('error', (error) => this.log.debug(`Java connection ${connection.id}: ${error.message}`));
        socket.once('close', () => {
            this.sockets.delete(socket);
            this.forget(socket, 'closed');
        });
    }
}
