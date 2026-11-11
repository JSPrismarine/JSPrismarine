import { EventEmitter } from 'node:events';

import { Connection } from './Connection';
import { ErrorCode, SignalStructure, SignalType } from './protocol/Signal';
import { randomUint64 } from './randomUint64';
import type { PeerConfig, WebRtcDriver } from './WebRtcDriver';

/** How long a join may wait for the answer, and then for the connection to open. */
export const DEFAULT_CLIENT_TIMEOUT_MS = 15_000;

/** What the client sends signals with: HTTP signaling, LAN discovery, or anything else. */
export type SignalSender = (signal: SignalStructure) => void;

/** How the client builds its peer and reaches the server. */
export interface NetherNetClientOptions {
    readonly driver: WebRtcDriver;
    /** Sends the client's signals to the server. */
    readonly signal: SignalSender;
    /** The server's network ID, when the carrier needs it; 0 when joining by address. */
    readonly serverNetworkId?: bigint;
    readonly networkId?: bigint;
    readonly connectionId?: bigint;
    readonly peerConfig?: PeerConfig;
    /** Rewrites the offer before it is sent, such as to add the `a=identity` attribute. */
    readonly prepareOffer?: (offer: string) => string | Promise<string>;
    /** How long the join may take, answer and connection together. */
    readonly timeoutMs?: number;
}

/**
 * NetherNet's client side: opens a peer with the reliable and unreliable channels, sends the
 * offer with every candidate through the given sender, and connects once the answer arrives
 * through {@link NetherNetClient.handleSignal}.
 *
 * Events: `connected` (Connection), `encapsulated` (message), `disconnect` (reason).
 */
export class NetherNetClient extends EventEmitter {
    public readonly networkId: bigint;
    public readonly connectionId: bigint;
    public readonly serverNetworkId: bigint;
    private connection: Connection | undefined;
    private timer: NodeJS.Timeout | undefined;
    private connected = false;
    private closed = false;

    /**
     * @param options - The driver, the signal sender and the IDs.
     */
    public constructor(private readonly options: NetherNetClientOptions) {
        super();
        this.networkId = options.networkId ?? randomUint64();
        this.connectionId = options.connectionId ?? randomUint64();
        this.serverNetworkId = options.serverNetworkId ?? 0n;
    }

    /**
     * Starts the join: builds the peer and its two channels, waits for every candidate, and sends
     * the offer. The answer has to come back through {@link NetherNetClient.handleSignal}.
     * @returns Resolves once the offer is sent.
     * @throws {Error} When the client was used before or closed, or the peer cannot be built.
     */
    public async connect(): Promise<void> {
        if (this.closed || this.connection !== undefined) throw new Error('A NetherNet client connects once');
        const timeoutMs = this.options.timeoutMs ?? DEFAULT_CLIENT_TIMEOUT_MS;
        this.timer = setTimeout(() => this.fail(ErrorCode.NegotiationTimeoutWaitingForResponse), timeoutMs);

        const peer = this.options.driver.createPeer(this.options.peerConfig);
        const connection = new Connection(this.connectionId, peer);
        this.connection = connection;
        connection.on('message', (message: Buffer) => this.emit('encapsulated', message));
        connection.once('close', (reason: string) => this.end(reason));
        peer.onStateChange((state) => {
            if (state === 'connected') this.open();
            if (state === 'disconnected' || state === 'failed' || state === 'closed')
                connection.peerEnded('disconnected');
        });

        const reliable = peer.createDataChannel('ReliableDataChannel');
        const unreliable = peer.createDataChannel('UnreliableDataChannel', { unordered: true, maxRetransmits: 0 });
        connection.setReliable(reliable);
        connection.setUnreliable(unreliable);
        reliable.onOpen(() => this.open());

        let offer = await peer.localDescription();
        if (this.closed) return;
        if (this.options.prepareOffer !== undefined) offer = await this.options.prepareOffer(offer);
        this.options.signal(
            new SignalStructure(SignalType.ConnectRequest, this.connectionId, offer, this.serverNetworkId)
        );
    }

    /**
     * Takes a signal from the server: the answer, a trickled candidate, or an error.
     * @param signal - The signal; one for another connection is ignored.
     */
    public handleSignal(signal: SignalStructure): void {
        const connection = this.connection;
        if (this.closed || connection === undefined || signal.connectionId !== this.connectionId) return;
        switch (signal.type) {
            case SignalType.ConnectResponse:
                try {
                    connection.peer.setRemoteDescription('answer', signal.data);
                } catch {
                    this.fail(ErrorCode.FailedToSetRemoteDescription);
                }
                return;
            case SignalType.CandidateAdd:
                try {
                    connection.peer.addRemoteCandidate(signal.data, '0');
                } catch {
                    this.fail(ErrorCode.CandidateAdd);
                }
                return;
            case SignalType.ConnectError:
                connection.close(`connecterror:${signal.data}`);
                return;
            default:
        }
    }

    /**
     * Sends one message.
     * @param message - The message.
     * @throws {Error} When the connection is not open.
     */
    public send(message: Uint8Array): void {
        if (!this.connected || this.connection === undefined) throw new Error('The NetherNet connection is not open');
        this.connection.send(message);
    }

    /** The connection, once it opened. */
    public get openConnection(): Connection | undefined {
        return this.connected ? this.connection : undefined;
    }

    /**
     * Hangs up.
     * @param reason - Why, which `disconnect` carries.
     */
    public close(reason = 'client disconnect'): void {
        if (this.connection === undefined) this.end(reason);
        else this.connection.close(reason);
    }

    private open(): void {
        const connection = this.connection;
        if (this.connected || connection === undefined || connection.closed) return;
        if (connection.peer.state !== 'connected' || connection.reliable?.readyState !== 'open') return;
        this.connected = true;
        clearTimeout(this.timer);
        this.emit('connected', connection);
    }

    private fail(code: number): void {
        try {
            this.options.signal(
                new SignalStructure(SignalType.ConnectError, this.connectionId, String(code), this.serverNetworkId)
            );
        } catch {
            // The server cannot be told; the close below still reports it here.
        }
        if (this.connection === undefined) this.end(`connecterror:${code}`);
        else this.connection.close(`connecterror:${code}`);
    }

    private end(reason: string): void {
        if (this.closed) return;
        this.closed = true;
        clearTimeout(this.timer);
        this.emit('disconnect', reason);
    }
}
