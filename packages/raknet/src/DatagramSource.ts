import Dgram from 'node:dgram';
import type { RemoteInfo } from 'node:dgram';
import { isIPv6 } from 'node:net';

import type { Logger } from './RakNetPeer';
import { configureSocketBuffers } from './SocketBuffers';
import type { SocketBufferOptions } from './SocketBuffers';

/** Receives each datagram a source delivers, with where it came from. */
export type DatagramListener = (datagram: Buffer, from: RemoteInfo) => void;

/**
 * Where a {@link ServerSocket} reads its datagrams and sends its own: a UDP socket of its own, or
 * a port another component owns and shares, such as the native networking library's port that
 * NetherNet also serves. RakNet's protocol code is the same over either.
 */
export interface DatagramSource {
    /**
     * Starts delivering datagrams.
     * @param address - The address to bind, IPv4 or IPv6.
     * @param port - The port to bind; 0 lets the operating system choose.
     * @param listener - Receives every datagram.
     * @returns The port clients reach.
     * @throws {Error} When the source cannot start, such as a port another program holds.
     */
    start(address: string, port: number, listener: DatagramListener): Promise<number>;
    /** Sends one datagram, made of these buffers in order. Nothing happens once the source closed. */
    send(buffers: Buffer | readonly Buffer[], port: number, address: string): void;
    /** Stops delivering and sending. */
    close(): void;
}

/**
 * A UDP socket of RakNet's own. An IPv6 address binds an IPv6-only socket, so the IPv4 and IPv6
 * listeners of one server never contend for the same traffic.
 */
export class UdpDatagramSource implements DatagramSource {
    private socket: Dgram.Socket | undefined;

    /**
     * @param logger - Where buffer sizes and send failures are reported.
     * @param socketBufferOptions - Requested UDP buffers, which the OS may cap.
     */
    public constructor(
        private readonly logger: Logger,
        private readonly socketBufferOptions: SocketBufferOptions = {}
    ) {}

    /** Binds the socket; see {@link DatagramSource.start}. */
    public start(address: string, port: number, listener: DatagramListener): Promise<number> {
        const socket = Dgram.createSocket(
            isIPv6(address) ? { type: 'udp6', ipv6Only: true } : { type: 'udp4' }
        ).unref();
        this.socket = socket;
        return new Promise((resolve, reject) => {
            socket.once('error', (error) => {
                socket.close();
                this.socket = undefined;
                reject(error);
            });
            socket.bind(port, address, () => {
                // dgram rejects buffer getters before bind, so configure and report them here.
                configureSocketBuffers(socket, this.logger, this.socketBufferOptions, 'RakNet/ServerSocket');
                socket.on('message', listener);
                resolve(socket.address().port);
            });
        });
    }

    /** Sends from the socket; see {@link DatagramSource.send}. */
    public send(buffers: Buffer | readonly Buffer[], port: number, address: string): void {
        // Sending on a closed socket throws ERR_SOCKET_DGRAM_NOT_RUNNING, which from a timer
        // callback would surface as an uncaughtException.
        if (this.socket === undefined) return;
        this.socket.send(buffers, port, address, (error) => {
            // The frame contents are borrowed buffers, so retain the vector until libuv has
            // finished reading it. Report asynchronous send failures just as the socket does.
            void buffers;
            if (error) this.logger.error(`Send failed, error=${error.message}`, 'RakNet/ServerSocket/send');
        });
    }

    /** Closes the socket. */
    public close(): void {
        const socket = this.socket;
        this.socket = undefined;
        socket?.close();
    }
}
