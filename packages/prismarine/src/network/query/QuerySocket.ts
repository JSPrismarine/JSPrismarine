import dgram from 'node:dgram';
import { isIPv6 } from 'node:net';

import type { Logger } from '@jsprismarine/logger';

import type { QueryResponder } from './QueryResponder';

/**
 * A UDP socket of the query protocol's own, for a `query-port` no RakNet listener holds.
 * Every datagram goes through the responder, and only its replies go back out.
 */
export class QuerySocket {
    private socket: dgram.Socket | undefined;

    /**
     * @param responder - Builds the reply to each request.
     * @param logger - Where a port that cannot be bound is reported.
     */
    public constructor(
        private readonly responder: Pick<QueryResponder, 'respond'>,
        private readonly logger: Logger
    ) {}

    /**
     * Binds the socket. A port another program holds costs the query protocol, with a
     * warning, not the server.
     * @param address - The address to bind, IPv4 or IPv6.
     * @param port - The port to bind; 0 lets the operating system choose.
     * @returns Resolves with the bound port, or `undefined` when the port could not be bound.
     */
    public start(address: string, port: number): Promise<number | undefined> {
        const socket = dgram.createSocket(isIPv6(address) ? { type: 'udp6', ipv6Only: true } : { type: 'udp4' });
        socket.unref();
        this.socket = socket;
        socket.on('message', (datagram, remote) => {
            const reply = this.responder.respond(datagram, remote.address, remote.port);
            if (reply !== undefined) socket.send(reply, remote.port, remote.address);
        });

        return new Promise((resolve) => {
            socket.once('error', (error) => {
                this.logger.warn(`Query is unavailable: UDP port ${port} is unavailable (${error.message})`);
                this.close();
                resolve(undefined);
            });
            socket.bind(port, address, () => {
                // Later errors are send failures to one client, not a reason to stop answering.
                socket.removeAllListeners('error');
                socket.on('error', (error) => this.logger.debug(`Query send failed: ${error.message}`));
                resolve(socket.address().port);
            });
        });
    }

    /** Closes the socket; a no-op before {@link start} or after a failed bind. */
    public close(): void {
        this.socket?.close();
        this.socket = undefined;
    }
}
