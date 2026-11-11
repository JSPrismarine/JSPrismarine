import dgram from 'node:dgram';
import { EventEmitter } from 'node:events';

import { NETHERNET_LAN_PORT } from './NetherNetDefaults';
import { DiscoveryPacketType, decodeDiscoveryPacket, encodeDiscoveryPacket } from './protocol/Discovery';
import type { DiscoveryPacket } from './protocol/Discovery';
import { SignalStructure } from './protocol/Signal';
import { randomUint64 } from './randomUint64';

/** How often a client asks the network who is there, as Bedrock does. */
export const DISCOVERY_INTERVAL_MS = 2_000;

/** A server that answered a discovery request. */
export interface DiscoveredServer {
    readonly networkId: bigint;
    readonly advertisement: Buffer;
    readonly address: string;
    readonly port: number;
}

/** Where a LAN discovery client asks, for a test that cannot use the fixed port. */
export interface LanDiscoveryOptions {
    readonly networkId?: bigint;
    readonly broadcastAddress?: string;
    readonly port?: number;
}

/**
 * The client half of LAN discovery on UDP 7551: broadcasts requests, collects the servers that
 * answer, and carries signals to one of them, so a {@link NetherNetClient} can join over the LAN.
 *
 * Events: `server` (DiscoveredServer), `signal` (SignalStructure from a server).
 */
export class LanDiscovery extends EventEmitter {
    public readonly networkId: bigint;
    /** Every server that answered, by network ID. */
    public readonly servers = new Map<bigint, DiscoveredServer>();
    private readonly socket = dgram.createSocket('udp4');
    private readonly broadcastAddress: string;
    private readonly port: number;
    private interval: NodeJS.Timeout | undefined;

    /**
     * @param options - The client's network ID and where to ask.
     */
    public constructor(options: LanDiscoveryOptions = {}) {
        super();
        this.networkId = options.networkId ?? randomUint64();
        this.broadcastAddress = options.broadcastAddress ?? '255.255.255.255';
        this.port = options.port ?? NETHERNET_LAN_PORT;
        this.socket.on('message', (datagram, from) => this.handle(datagram, from));
    }

    /** Binds a socket and starts asking every {@link DISCOVERY_INTERVAL_MS}. */
    public async start(): Promise<void> {
        await new Promise<void>((resolve, reject) => {
            this.socket.once('error', reject);
            this.socket.bind(0, () => {
                this.socket.off('error', reject);
                this.socket.setBroadcast(true);
                resolve();
            });
        });
        this.request();
        this.interval = setInterval(() => this.request(), DISCOVERY_INTERVAL_MS);
        this.interval.unref();
    }

    /** Asks once. */
    public request(): void {
        this.send({ type: DiscoveryPacketType.Request, senderId: this.networkId }, this.port, this.broadcastAddress);
    }

    /**
     * Sends a signal to a server that answered.
     * @param signal - The signal; its network ID names the server.
     * @throws {Error} When no server with that ID answered.
     */
    public sendSignal(signal: SignalStructure): void {
        const server = signal.networkId === undefined ? undefined : this.servers.get(signal.networkId);
        if (server === undefined) throw new Error(`No NetherNet server ${signal.networkId} answered on the LAN`);
        this.send(
            {
                type: DiscoveryPacketType.Message,
                senderId: this.networkId,
                recipientId: server.networkId,
                data: signal.toString()
            },
            server.port,
            server.address
        );
    }

    /** Stops asking and closes the socket. */
    public close(): void {
        clearInterval(this.interval);
        this.socket.close();
    }

    private send(packet: DiscoveryPacket, port: number, address: string): void {
        this.socket.send(encodeDiscoveryPacket(packet), port, address);
    }

    private handle(datagram: Buffer, from: dgram.RemoteInfo): void {
        let packet: DiscoveryPacket;
        try {
            packet = decodeDiscoveryPacket(datagram);
        } catch {
            return;
        }
        if (packet.type === DiscoveryPacketType.Response) {
            const server = {
                networkId: packet.senderId,
                advertisement: packet.advertisement,
                address: from.address,
                port: from.port
            };
            this.servers.set(packet.senderId, server);
            this.emit('server', server);
            return;
        }
        if (packet.type !== DiscoveryPacketType.Message || packet.recipientId !== this.networkId) return;
        if (packet.data === '' || packet.data === 'Ping') return;
        try {
            const signal = SignalStructure.fromString(packet.data);
            signal.networkId = packet.senderId;
            this.emit('signal', signal);
        } catch {
            // Not a signal.
        }
    }
}
