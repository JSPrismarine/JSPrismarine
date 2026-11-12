import dgram from 'node:dgram';
import { EventEmitter } from 'node:events';

import { Connection } from './Connection';
import type { ConnectionOptions } from './Connection';
import type { PortAllocator } from './PortAllocator';
import { NETHERNET_LAN_PORT } from './NetherNetDefaults';
import { identityProofOf } from './NetherNetIdentity';
import type { IdentityProof } from './NetherNetIdentity';
import { withoutIdentity } from './sdp';
import { DiscoveryPacketType, decodeDiscoveryPacket, encodeDiscoveryPacket } from './protocol/Discovery';
import type { DiscoveryPacket } from './protocol/Discovery';
import { ErrorCode, SignalStructure, SignalType } from './protocol/Signal';
import { randomUint64 } from './randomUint64';
import type { DriverChannel, PeerConfig, WebRtcDriver } from './WebRtcDriver';

/**
 * How long a peer may take from its answer to opening both channels and connecting. Ten seconds
 * is the default EndstoneMC's NetherNet specification gives for Bedrock's negotiation timeout.
 * A client joining by address may ask its player to trust the server after it has the answer,
 * and the time the player takes counts against this.
 */
export const DEFAULT_ACCEPT_TIMEOUT_MS = 10_000;

/** The two channels a NetherNet client opens, and nothing else. */
const EXPECTED_CHANNELS = ['ReliableDataChannel', 'UnreliableDataChannel'] as const;

/** How a signal's answer goes back to the client that sent it. */
export type SignalResponder = (signal: SignalStructure) => void;

/** How the server builds each peer, and how long it waits for one. */
export interface NetherNetServerOptions {
    readonly driver: WebRtcDriver;
    /** The server's network ID; random when absent. */
    readonly networkId?: bigint;
    /** The address LAN discovery binds; every IPv4 interface when absent. */
    readonly host?: string;
    /** The LAN discovery port; NetherNet's fixed 7551 when absent, which a test cannot share. */
    readonly lanPort?: number;
    readonly acceptTimeoutMs?: number;
    /** The configuration of the peer for a new offer, such as its bind address. */
    readonly peerConfig?: (connectionId: bigint) => PeerConfig;
    /**
     * The local UDP ports peers share, one mux port each; the system picks a port per peer when
     * absent.
     */
    readonly ports?: PortAllocator;
    /** How much each connection accepts and buffers; the protocol's limits when absent. */
    readonly connection?: ConnectionOptions;
}

/** A close reason with what went wrong, so the log line that reports it says why. */
const withCause = (reason: string, error: unknown): string =>
    `${reason}: ${error instanceof Error ? error.message : String(error)}`;

/**
 * NetherNet's server side: turns each client's offer into an answer over a WebRTC driver, and
 * keeps the connection it negotiates. Offers arrive through {@link NetherNetServer.handleOffer},
 * from HTTP signaling, or from LAN discovery on UDP 7551 once {@link NetherNetServer.listen} binds it.
 *
 * Events: `openConnection` (Connection), once both channels are open and the peer is connected;
 * `closeConnection` (connection ID, reason); `encapsulated` (message, connection ID).
 */
export class NetherNetServer extends EventEmitter {
    public readonly networkId: bigint;
    /** Every connection by the ID its client picked, opened or still negotiating. */
    public readonly connections = new Map<bigint, Connection>();
    private readonly acceptTimeouts = new Map<bigint, NodeJS.Timeout>();
    /** The mux port each connection was given. */
    private readonly portOf = new Map<bigint, number>();
    private readonly acceptTimeoutMs: number;
    private socket: dgram.Socket | undefined;
    private advertisement: Buffer | undefined;
    private closed = false;

    /**
     * @param options - The driver and how to build each peer.
     */
    public constructor(private readonly options: NetherNetServerOptions) {
        super();
        this.networkId = options.networkId ?? randomUint64();
        this.acceptTimeoutMs = options.acceptTimeoutMs ?? DEFAULT_ACCEPT_TIMEOUT_MS;
    }

    /**
     * Negotiates a peer for a client's offer and sends the answer, with every candidate, through
     * `respond`. An offer for a connection ID already in use is ignored.
     * @param signal - The `CONNECTREQUEST`.
     * @param respond - Sends a signal back to that client.
     * @param proof - What the offer's `a=identity` proves, when the caller took it out of the
     *   offer already; read from the offer when absent.
     */
    public async handleOffer(signal: SignalStructure, respond: SignalResponder, proof?: IdentityProof): Promise<void> {
        if (this.closed || this.connections.has(signal.connectionId)) return;
        const fail = (code: number, reason: string, connection?: Connection): void => {
            try {
                respond(
                    new SignalStructure(SignalType.ConnectError, signal.connectionId, String(code), signal.networkId)
                );
            } catch {
                // The client is gone; there is nobody to tell.
            }
            connection?.close(reason);
        };

        let connection: Connection;
        const port = this.options.ports?.acquire();
        try {
            const config = this.options.peerConfig?.(signal.connectionId) ?? {};
            connection = new Connection(
                signal.connectionId,
                this.options.driver.createPeer(
                    port === undefined
                        ? config
                        : { ...config, enableIceUdpMux: true, portRangeBegin: port, portRangeEnd: port }
                ),
                this.options.connection
            );
        } catch {
            if (port !== undefined) this.options.ports?.release(port);
            fail(ErrorCode.FailedToCreatePeerConnection, 'peerfailed');
            return;
        }
        if (port !== undefined) this.portOf.set(signal.connectionId, port);
        this.connections.set(signal.connectionId, connection);
        connection.on('message', (message: Buffer) => this.emit('encapsulated', message, signal.connectionId));
        connection.once('close', (reason: string) => this.forget(connection, reason));

        const channels = new Set<string>();
        let opened = false;
        const open = (): void => {
            if (opened || connection.closed || connection.peer.state !== 'connected') return;
            if (channels.size !== EXPECTED_CHANNELS.length || connection.reliable?.readyState !== 'open') return;
            opened = true;
            this.clearAcceptTimeout(signal.connectionId);
            this.emit('openConnection', connection);
        };
        connection.peer.onDataChannel((channel: DriverChannel) => {
            if (!EXPECTED_CHANNELS.some((label) => label === channel.label) || channels.has(channel.label)) {
                fail(ErrorCode.IncomingConnectionIgnored, `unexpectedchannel:${channel.label}`, connection);
                return;
            }
            channels.add(channel.label);
            if (channel.label === 'ReliableDataChannel') {
                connection.setReliable(channel);
                channel.onOpen(open);
            } else {
                connection.setUnreliable(channel);
            }
            open();
        });
        connection.peer.onStateChange((state) => {
            if (state === 'connected') open();
            if (state === 'disconnected' || state === 'failed' || state === 'closed')
                connection.peerEnded('disconnected');
        });

        connection.identityProof = proof ?? identityProofOf(signal.data);
        connection.useRemoteDescription(signal.data);
        try {
            // The identity is NetherNet's attribute; WebRTC does not know it.
            connection.peer.setRemoteDescription('offer', withoutIdentity(signal.data));
        } catch (error: unknown) {
            fail(ErrorCode.FailedToSetRemoteDescription, withCause('offerfailed', error), connection);
            return;
        }
        let answer: string;
        try {
            answer = await connection.peer.localDescription();
        } catch (error: unknown) {
            if (!connection.closed) fail(ErrorCode.FailedToCreateAnswer, withCause('answerfailed', error), connection);
            return;
        }
        if (connection.closed) return;
        try {
            respond(new SignalStructure(SignalType.ConnectResponse, signal.connectionId, answer, signal.networkId));
        } catch {
            fail(ErrorCode.SignalingFailedToSend, 'signalingfailed', connection);
            return;
        }
        this.armAcceptTimeout(connection, signal, respond);
    }

    /**
     * Adds a candidate a client trickled after its offer.
     * @param signal - The `CANDIDATEADD`.
     * @param respond - Sends a signal back to that client.
     */
    public handleCandidate(signal: SignalStructure, respond?: SignalResponder): void {
        const connection = this.connections.get(signal.connectionId);
        if (connection === undefined) return;
        try {
            connection.peer.addRemoteCandidate(signal.data, '0');
        } catch {
            respond?.(
                new SignalStructure(
                    SignalType.ConnectError,
                    signal.connectionId,
                    String(ErrorCode.CandidateAdd),
                    signal.networkId
                )
            );
            connection.close('candidateaddfailed');
        }
    }

    /**
     * Sets what a LAN discovery request is answered with.
     * @param advertisement - The bytes `encodeLanAdvertisement` makes.
     */
    public setAdvertisement(advertisement: Buffer): void {
        this.advertisement = advertisement;
    }

    /**
     * Binds UDP 7551 and answers LAN discovery: requests with the advertisement, and signals
     * addressed to this server's network ID.
     * @throws {Error} When the port cannot be bound.
     */
    public async listen(): Promise<void> {
        if (this.closed) throw new Error('The NetherNet server is closed');
        const socket = dgram.createSocket({ type: 'udp4', reuseAddr: false });
        this.socket = socket;
        socket.on('message', (datagram, from) => this.handleDiscovery(datagram, from));
        await new Promise<void>((resolve, reject) => {
            socket.once('error', reject);
            socket.bind(this.options.lanPort ?? NETHERNET_LAN_PORT, this.options.host ?? '0.0.0.0', () => {
                socket.off('error', reject);
                resolve();
            });
        });
    }

    /**
     * Closes every connection and LAN discovery.
     * @param reason - Why, which each connection's `closeConnection` carries.
     */
    public close(reason = 'Server closed'): void {
        if (this.closed) return;
        this.closed = true;
        for (const connection of [...this.connections.values()]) connection.close(reason);
        this.socket?.close();
        this.socket = undefined;
    }

    private handleDiscovery(datagram: Buffer, from: dgram.RemoteInfo): void {
        let packet: DiscoveryPacket;
        try {
            packet = decodeDiscoveryPacket(datagram);
        } catch {
            return;
        }
        const send = (reply: DiscoveryPacket): void => {
            this.socket?.send(encodeDiscoveryPacket(reply), from.port, from.address);
        };
        if (packet.type === DiscoveryPacketType.Request) {
            if (this.advertisement === undefined) return;
            send({ type: DiscoveryPacketType.Response, senderId: this.networkId, advertisement: this.advertisement });
            return;
        }
        if (packet.type !== DiscoveryPacketType.Message || packet.recipientId !== this.networkId) return;
        if (packet.data === '' || packet.data === 'Ping') return;
        let signal: SignalStructure;
        try {
            signal = SignalStructure.fromString(packet.data);
        } catch {
            return;
        }
        signal.networkId = packet.senderId;
        const respond: SignalResponder = (reply) =>
            send({
                type: DiscoveryPacketType.Message,
                senderId: this.networkId,
                recipientId: packet.senderId,
                data: reply.toString()
            });
        switch (signal.type) {
            case SignalType.ConnectRequest:
                void this.handleOffer(signal, respond);
                break;
            case SignalType.CandidateAdd:
                this.handleCandidate(signal, respond);
                break;
            case SignalType.ConnectError:
                this.connections.get(signal.connectionId)?.close(`connecterror:${signal.data}`);
                break;
        }
    }

    private armAcceptTimeout(connection: Connection, signal: SignalStructure, respond: SignalResponder): void {
        this.clearAcceptTimeout(connection.id);
        if (this.acceptTimeoutMs <= 0) return;
        const timeout = setTimeout(() => {
            this.acceptTimeouts.delete(connection.id);
            if (this.connections.get(connection.id) !== connection) return;
            try {
                respond(
                    new SignalStructure(
                        SignalType.ConnectError,
                        signal.connectionId,
                        String(ErrorCode.NegotiationTimeoutWaitingForAccept),
                        signal.networkId
                    )
                );
            } catch {
                // The client is gone.
            }
            connection.close(`connecterror:${ErrorCode.NegotiationTimeoutWaitingForAccept}`);
        }, this.acceptTimeoutMs);
        timeout.unref();
        this.acceptTimeouts.set(connection.id, timeout);
    }

    private clearAcceptTimeout(id: bigint): void {
        const timeout = this.acceptTimeouts.get(id);
        if (timeout === undefined) return;
        clearTimeout(timeout);
        this.acceptTimeouts.delete(id);
    }

    private forget(connection: Connection, reason: string): void {
        if (this.connections.get(connection.id) !== connection) return;
        this.clearAcceptTimeout(connection.id);
        this.connections.delete(connection.id);
        const port = this.portOf.get(connection.id);
        if (port !== undefined) {
            this.portOf.delete(connection.id);
            this.options.ports?.release(port);
        }
        this.emit('closeConnection', connection.id, reason);
    }
}
