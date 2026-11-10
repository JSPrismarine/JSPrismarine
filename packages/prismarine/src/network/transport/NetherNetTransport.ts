import { BATCH_PACKET_ID } from '@jsprismarine/protocol';
import { InetAddress } from '@jsprismarine/raknet';
import { isRecord } from '../../utils/isRecord';
import type { ConnectionId, ConnectionIds } from './ConnectionId';
import { KeyedTransport } from './KeyedTransport';
import type { TransportCapabilities, TransportConnection } from './Transport';

/**
 * The largest message `nethernet` can send: it splits a message into fragments of 10,000 bytes
 * and counts the ones still to come in a single byte, so 256 fragments at most.
 */
const NETHERNET_MAX_MESSAGE_SIZE = 256 * 10_000;

/**
 * What NetherNet does on its own. DTLS encrypts the data channel, so the session skips the
 * Minecraft encryption handshake, and the reliable channel is ordered and fragments for us.
 * A frame carries the `0xFE` byte the wire leaves out, so it may be one byte longer than a
 * message.
 */
const NETHERNET_CAPABILITIES: TransportCapabilities = {
    encrypted: true,
    reliableOrdered: true,
    maxFrameSize: NETHERNET_MAX_MESSAGE_SIZE + 1
};

/**
 * How many messages a peer may send before `nethernet` says it opened. A client sends its first
 * packet as soon as its reliable channel opens, which can be before its other channel arrives;
 * a handful covers that, and the cap keeps a peer that never opens from holding memory.
 */
const EARLY_MESSAGE_LIMIT = 16;

/** Where a peer whose address the transport could not learn is said to be. */
const UNKNOWN_ADDRESS = new InetAddress('0.0.0.0', 0);

/** The part of a `nethernet` connection the transport uses. */
export interface NetherNetPeer {
    /** The connection ID the client chose, which is how `nethernet` keys its connections. */
    readonly address: bigint;
    /** The WebRTC peer connection underneath, whose chosen ICE pair names the client's address. */
    readonly rtcConnection?: unknown;
    /** Whether the peer has closed; `nethernet` throws on a send after that. */
    readonly closed: boolean;
    /** Sends one message on the reliable data channel, fragmenting it as needed. */
    send(data: Buffer): number;
    /** Closes the peer connection. */
    close(reason?: string): void;
}

/**
 * The `nethernet` `Server` surface {@link NetherNetTransport} consumes, narrowed so a test can
 * stand in a plain event emitter. `nethernet`'s `Server` satisfies it structurally.
 */
export interface NetherNetTransportSource {
    on(event: 'openConnection', listener: (connection: NetherNetPeer) => void): unknown;
    on(event: 'closeConnection', listener: (connectionId: bigint, reason: string) => void): unknown;
    on(event: 'encapsulated', listener: (data: Buffer, connectionId: bigint) => void): unknown;
    close(reason?: string): void;
}

/** Where the transport reports peers opening and peers that never did. `Logger` fits. */
export interface NetherNetTransportLog {
    info(message: string): void;
    warn(message: string): void;
}

/**
 * Says where a NetherNet client connected from. Signaling knows (the HTTP request or LAN
 * datagram that carried the offer came from somewhere), and so does the ICE pair WebRTC chose.
 */
export type NetherNetPeerAddress = (peer: NetherNetPeer) => InetAddress | undefined;

/**
 * The address and port in an ICE candidate line, which reads
 * `candidate:<foundation> <component> <protocol> <priority> <address> <port> typ <type> …`.
 * @param candidate - The candidate line, with or without the `a=` SDP prefix.
 * @returns The address, or undefined for a line that does not have one where the format puts it.
 */
export const candidateAddress = (candidate: string): InetAddress | undefined => {
    const fields = candidate.replace(/^a=/, '').split(' ');
    const address = fields[4];
    const port = Number(fields[5]);
    if (!address || !Number.isInteger(port) || port < 1 || port > 65_535) return undefined;
    return new InetAddress(address, port);
};

/**
 * Where the client is, read from the ICE candidate pair the peer connection chose. That is the
 * address the client's traffic really comes from, whichever signaling channel introduced it.
 * Werift, `nethernet`'s default WebRTC backend, exposes the pair on its ICE transport; with any
 * other backend this finds nothing and the caller falls back.
 */
export const selectedCandidateAddress: NetherNetPeerAddress = (peer) => {
    const rtc = peer.rtcConnection;
    if (!isRecord(rtc) || !Array.isArray(rtc.iceTransports)) return undefined;
    const ice: unknown = rtc.iceTransports[0];
    if (!isRecord(ice) || typeof ice.getSelectedCandidatePair !== 'function') return undefined;
    const pair: unknown = ice.getSelectedCandidatePair();
    if (!isRecord(pair) || !isRecord(pair.remote) || typeof pair.remote.candidate !== 'string') return undefined;
    return candidateAddress(pair.remote.candidate);
};

/**
 * One NetherNet peer as a {@link TransportConnection}. Frames go out on the reliable data
 * channel without their `0xFE` batch id, which NetherNet's wire does not carry.
 */
export class NetherNetTransportConnection implements TransportConnection {
    public readonly capabilities = NETHERNET_CAPABILITIES;

    public constructor(
        public readonly id: ConnectionId,
        private readonly peer: NetherNetPeer,
        public readonly address: InetAddress
    ) {}

    /**
     * Sends the batch without its `0xFE` id. The data channel has no flush to skip, so
     * `immediate` changes nothing. A frame for a peer that has closed is dropped, as RakNet drops
     * one for a session it has forgotten: the session above may still be finishing a send.
     * @throws {Error} When the frame is not a batch or is larger than one message can carry.
     */
    public sendFrame(payload: Buffer): void {
        if (payload[0] !== BATCH_PACKET_ID) {
            throw new Error(`A NetherNet frame must be a batch, got id 0x${payload[0]?.toString(16)}`);
        }
        if (payload.byteLength > this.capabilities.maxFrameSize) {
            throw new RangeError(`A ${payload.byteLength} byte frame exceeds NetherNet's message limit`);
        }
        if (this.peer.closed) return;
        this.peer.send(payload.subarray(1));
    }

    /** Closes the peer connection; `nethernet` then reports it closed with this reason. */
    public close(reason?: string): void {
        this.peer.close(reason);
    }
}

/**
 * `nethernet`'s `Server` as a {@link Transport}. A message from a client becomes a frame with
 * the `0xFE` batch id put back in front, so the layers above read one format from every
 * transport.
 *
 * How the offer reached the server (LAN discovery on UDP 7551, or HTTP signaling on the game
 * port) is not this class's business: both feed the same `nethernet` `Server`.
 */
export default class NetherNetTransport extends KeyedTransport<NetherNetTransportConnection, bigint> {
    /** Messages from peers `nethernet` has not yet said are open, in arrival order. */
    private readonly early = new Map<bigint, Buffer[]>();

    /**
     * @param source - The `nethernet` server whose connections this carries.
     * @param ids - The connection ID allocator every transport of the server shares.
     * @param peerAddress - Where a newly opened peer connected from, when anything knows.
     */
    public constructor(
        private readonly source: NetherNetTransportSource,
        ids: ConnectionIds,
        private readonly peerAddress: NetherNetPeerAddress = selectedCandidateAddress,
        private readonly log: NetherNetTransportLog = { info: () => {}, warn: () => {} }
    ) {
        super(ids);
        // `nethernet` keys a peer on the connection ID the client picked. That ID stays in here:
        // the server knows the connection by the one `accept` allocates.
        source.on('openConnection', (peer) => {
            const address = this.peerAddress(peer) ?? UNKNOWN_ADDRESS;
            const accepted = this.accept(peer.address, (id) => new NetherNetTransportConnection(id, peer, address));
            const early = this.early.get(peer.address) ?? [];
            this.early.delete(peer.address);
            if (accepted === undefined) return;
            this.log.info(`NetherNet peer ${peer.address} opened from ${address} as connection ${accepted.id}`);
            for (const frame of early) this.receive(peer.address, frame);
        });
        // A peer that closes before it opened was never accepted, so `forget` finds nothing.
        source.on('closeConnection', (connectionId, reason) => {
            // A peer that never opened is a join WebRTC could not finish: nothing else reports it.
            if (this.connectionOf(connectionId) === undefined) {
                this.log.warn(`NetherNet peer ${connectionId} closed before it opened: ${reason}`);
            }
            this.early.delete(connectionId);
            this.forget(connectionId, reason);
        });
        source.on('encapsulated', (data, connectionId) => {
            const frame = Buffer.allocUnsafe(data.byteLength + 1);
            frame[0] = BATCH_PACKET_ID;
            data.copy(frame, 1);
            if (this.connectionOf(connectionId) !== undefined) {
                this.receive(connectionId, frame);
                return;
            }
            // `nethernet` delivers messages from a peer it has not yet said is open. Dropping
            // them loses a client's first packet, and the client then waits for a reply forever.
            const early = this.early.get(connectionId) ?? [];
            if (early.length >= EARLY_MESSAGE_LIMIT) return;
            early.push(frame);
            this.early.set(connectionId, early);
        });
    }

    /** Closes the `nethernet` server, which closes every peer connection with it. */
    public close(): void {
        this.source.close('Server closed');
    }
}
