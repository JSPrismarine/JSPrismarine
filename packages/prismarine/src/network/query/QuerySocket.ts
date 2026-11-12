import dgram from 'node:dgram';
import { isIPv6 } from 'node:net';

import type { Logger } from '@jsprismarine/logger';
import type { DatagramSource } from '@jsprismarine/raknet';

import type { QueryResponder } from './QueryResponder';

/**
 * The query protocol's own way in, for a `query-port` no RakNet listener holds: a UDP socket of
 * its own, or a port another component owns and shares, such as NetherNet's when RakNet is off.
 * Every datagram goes through the responder, and only its replies go back out.
 */
export class QuerySocket {
    private socket: dgram.Socket | undefined;

    /**
     * @param responder - Builds the reply to each request.
     * @param logger - Where a port that cannot be bound is reported.
     * @param source - A shared port to read and answer through instead of a socket of its own.
     */
    public constructor(
        private readonly responder: Pick<QueryResponder, 'respond'>,
        private readonly logger: Logger,
        private readonly source?: DatagramSource
    ) {}

    /**
     * Binds the socket. A port another program holds costs the query protocol, with a
     * warning, not the server.
     * @param address - The address to bind, IPv4 or IPv6.
     * @param port - The port to bind; 0 lets the operating system choose.
     * @returns Resolves with the bound port, or `undefined` when the port could not be bound.
     */
    public async start(address: string, port: number): Promise<number | undefined> {
        const source = this.source;
        if (source !== undefined) {
            try {
                return await source.start(address, port, (datagram, remote) => {
                    const reply = this.responder.respond(datagram, remote.address, remote.port);
                    if (reply !== undefined) source.send(reply, remote.port, remote.address);
                });
            } catch (error: unknown) {
                const message = error instanceof Error ? error.message : String(error);
                this.logger.warn(`Query is unavailable: UDP port ${port} is unavailable (${message})`);
                source.close();
                return undefined;
            }
        }
        const socket = dgram.createSocket(isIPv6(address) ? { type: 'udp6', ipv6Only: true } : { type: 'udp4' });
        socket.unref();
        this.socket = socket;
        socket.on('message', (datagram, remote) => {
            const reply = this.responder.respond(datagram, remote.address, remote.port);
            if (reply !== undefined) socket.send(reply, remote.port, remote.address);
        });

        return await new Promise((resolve) => {
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

    /** Closes the socket or stops reading the shared port; a no-op before {@link start} or after a failed bind. */
    public close(): void {
        this.source?.close();
        this.socket?.close();
        this.socket = undefined;
    }
}
