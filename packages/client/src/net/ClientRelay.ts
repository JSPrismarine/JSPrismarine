import dgram from 'node:dgram';
import { isIPv4, isIPv6 } from 'node:net';

import { withRewrittenCandidates } from '@jsprismarine/nethernet';

/** One server candidate and the loopback socket the client's WebRTC reaches it through. */
interface Route {
    readonly loopback: dgram.Socket;
    readonly server: { readonly address: string; readonly port: number };
    /** Where the client's WebRTC sends from, once it has sent. */
    client?: { readonly address: string; readonly port: number };
}

/** What the relay carried, by direction. */
export interface RelayCounts {
    readonly toServer: number;
    readonly toClient: number;
}

const bind = (socket: dgram.Socket, address: string): Promise<void> =>
    new Promise((resolve, reject) => {
        socket.once('error', reject);
        socket.bind(0, address, () => {
            socket.off('error', reject);
            resolve();
        });
    });

/**
 * Puts Node.js sockets between the client's WebRTC and the server, so `LinkConditions`, which
 * conditions Node.js sockets only, reaches NetherNet too. The client's WebRTC binds to
 * `127.0.0.1` and offers no candidates; each of the server's candidates in the answer is
 * rewritten to a loopback socket of the relay, which forwards to the server's real address from
 * a public socket and back. A test tool: its extra hop is the point.
 */
export class ClientRelay {
    private readonly routes = new Map<string, Route>();
    private readonly publics = new Map<4 | 6, dgram.Socket>();
    private toServer = 0;
    private toClient = 0;
    private closed = false;

    /** What the relay carried so far. */
    public counts(): RelayCounts {
        return { toServer: this.toServer, toClient: this.toClient };
    }

    /** How many sockets the relay holds. */
    public get socketCount(): number {
        return this.routes.size + this.publics.size;
    }

    /**
     * Rewrites every UDP candidate in the server's answer to a loopback socket of the relay.
     * @param answer - The answer's SDP.
     * @returns The answer the client's WebRTC is given.
     */
    public rewriteAnswer(answer: string): Promise<string> {
        return withRewrittenCandidates(answer, async (address, port) => {
            const family = isIPv4(address) ? 4 : isIPv6(address) && !address.includes('%') ? 6 : undefined;
            if (family === undefined) return undefined;
            const key = `${address}|${port}`;
            let route = this.routes.get(key);
            if (route === undefined) {
                const loopback = dgram.createSocket('udp4');
                await bind(loopback, '127.0.0.1');
                const created: Route = { loopback, server: { address, port } };
                route = created;
                this.routes.set(key, created);
                loopback.on('message', (datagram, from) => {
                    created.client = { address: from.address, port: from.port };
                    void this.publicFor(family).then((socket) => {
                        if (this.closed) return;
                        this.toServer++;
                        socket.send(datagram, port, address);
                    });
                });
            }
            return { address: '127.0.0.1', port: route.loopback.address().port };
        });
    }

    /** Closes every socket. */
    public close(): void {
        this.closed = true;
        for (const route of this.routes.values()) route.loopback.close();
        for (const socket of this.publics.values()) socket.close();
        this.routes.clear();
        this.publics.clear();
    }

    private async publicFor(family: 4 | 6): Promise<dgram.Socket> {
        const existing = this.publics.get(family);
        if (existing !== undefined) return existing;
        const socket = family === 4 ? dgram.createSocket('udp4') : dgram.createSocket({ type: 'udp6', ipv6Only: true });
        this.publics.set(family, socket);
        socket.on('message', (datagram, from) => {
            const route = this.routes.get(`${from.address}|${from.port}`);
            if (route?.client === undefined || this.closed) return;
            this.toClient++;
            route.loopback.send(datagram, route.client.port, route.client.address);
        });
        await bind(socket, family === 4 ? '0.0.0.0' : '::');
        return socket;
    }
}
