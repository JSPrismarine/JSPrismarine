import type { Cipheriv, Decipheriv } from 'node:crypto';
import { createCipheriv, createDecipheriv } from 'node:crypto';
import { EventEmitter } from 'node:events';
import type { Socket } from 'node:net';
import { connect } from 'node:net';

import { ClientErrors } from '@jsprismarine/errors/client';
import type { JavaPacketBody, JavaPacketDefinition, JavaPayload } from '@jsprismarine/protocol/java/packet/JavaPacket';
import { encodeJavaPacket, readJavaPacketId } from '@jsprismarine/protocol/java/packet/JavaPacket';
import type { JavaProtocol } from '@jsprismarine/protocol/java/versions/javaRelease';
import { compressFrame, decompressFrame } from '@jsprismarine/protocol/java/wire/compression';
import { framed, JavaFrameReader } from '@jsprismarine/protocol/java/wire/frames';

/** What a {@link JavaSocket} reports. */
export interface JavaSocketEvents {
    /** One packet the server sent, its id read and its fields not yet. */
    packet: [packet: JavaPacketBody];
    /** The socket broke, or the server sent bytes that are not frames. */
    error: [error: Error];
    /** The connection is gone, from either end. */
    close: [];
}

/**
 * A Java Edition connection's client end on TCP: it frames each packet, compresses once the
 * server says to and encrypts once the login turned it on, both ways.
 */
export class JavaSocket extends EventEmitter<JavaSocketEvents> {
    private readonly reader = new JavaFrameReader();
    private cipher: { readonly out: Cipheriv; readonly in: Decipheriv } | undefined;
    private compression: number | undefined;

    private constructor(
        private readonly socket: Socket,
        /** The release whose packet ids this connection writes. */
        public readonly protocol: JavaProtocol
    ) {
        super();
        socket.setNoDelay(true);
        socket.on('data', (chunk: Buffer) => this.received(chunk));
        // Reported to whoever listens; the close that follows an error is reported either way.
        socket.on('error', (error) => this.failed(error));
        socket.once('close', () => this.emit('close'));
    }

    /**
     * Opens a connection.
     * @param host - The server's address.
     * @param port - Its TCP port.
     * @param protocol - The release to speak.
     * @returns The connection, once the socket is open.
     */
    public static open(host: string, port: number, protocol: JavaProtocol): Promise<JavaSocket> {
        return new Promise((resolve, reject) => {
            const socket = connect(port, host);
            socket.once('error', reject);
            socket.once('connect', () => {
                socket.off('error', reject);
                resolve(new JavaSocket(socket, protocol));
            });
        });
    }

    /**
     * Writes one packet.
     * @param definition - The packet.
     * @param value - Its fields.
     */
    public send<D extends JavaPacketDefinition>(definition: D, value: JavaPayload<D>): void {
        if (this.socket.destroyed) return;
        const packet = encodeJavaPacket(this.protocol, definition, value);
        const bytes = framed(this.compression === undefined ? packet : compressFrame(packet, this.compression));
        this.socket.write(this.cipher === undefined ? bytes : this.cipher.out.update(bytes));
    }

    /**
     * Encrypts both ways from here on, as a client does once it has sent its encryption response.
     * @param secret - The shared secret, which is the AES key and the first block both.
     */
    public encrypt(secret: Buffer): void {
        this.cipher = {
            out: createCipheriv('aes-128-cfb8', secret, secret),
            in: createDecipheriv('aes-128-cfb8', secret, secret)
        };
    }

    /**
     * Compresses both ways from here on, as a client does once `Set Compression` arrives.
     * @param threshold - The size from which a packet is deflated.
     */
    public compress(threshold: number): void {
        this.compression = threshold;
    }

    /** Whether the connection is gone. */
    public get closed(): boolean {
        return this.socket.destroyed;
    }

    /** Hangs up. */
    public close(): void {
        this.socket.end();
        this.socket.destroy();
    }

    /**
     * Reads the frames in a chunk. A packet that turns compression on applies from the next frame,
     * since each frame reaches the listener before the next one is decompressed.
     */
    private received(chunk: Buffer): void {
        const read = this.reader.push(this.cipher === undefined ? chunk : this.cipher.in.update(chunk));
        if ('malformed' in read) {
            this.failed(new ClientErrors.JavaFrameMalformed({ malformed: read.malformed }));
            this.close();
            return;
        }
        for (const frame of read.frames) {
            if (this.socket.destroyed) return;
            try {
                this.emit(
                    'packet',
                    readJavaPacketId(this.compression === undefined ? frame : decompressFrame(frame, this.compression))
                );
            } catch (error) {
                if (error instanceof Error) this.failed(error);
                this.close();
                return;
            }
        }
    }

    private failed(error: Error): void {
        if (this.listenerCount('error') > 0) this.emit('error', error);
    }
}
