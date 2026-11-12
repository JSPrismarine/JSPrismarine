import { MAX_MESSAGE_BYTES } from '@jsprismarine/nethernet';
import type { Connection } from '@jsprismarine/nethernet';
import { BATCH_PACKET_ID } from '@jsprismarine/protocol';
import { InetAddress } from '@jsprismarine/raknet';
import type { ConnectionId, ConnectionIds } from './ConnectionId';
import { KeyedTransport } from './KeyedTransport';
import { TransportNames } from './Transport';
import type { TransportCapabilities, TransportConnection } from './Transport';

/**
 * What NetherNet does on its own. DTLS encrypts the data channel, so the session skips the
 * Minecraft encryption handshake, and the reliable channel is ordered and segments for us.
 * A frame carries the `0xFE` byte the wire leaves out, so it may be one byte longer than a
 * message.
 */
const NETHERNET_CAPABILITIES: TransportCapabilities = {
    encrypted: true,
    reliableOrdered: true,
    maxFrameSize: MAX_MESSAGE_BYTES + 1
};

/**
 * How many messages a peer may send before the server says it opened. A client sends its first
 * packet as soon as its reliable channel opens, which can be before its other channel arrives;
 * a handful covers that, and the caps keep a peer that never opens from holding memory.
 */
const EARLY_MESSAGE_LIMIT = 16;

/** How many bytes those messages may add up to. What a client sends this early is a few bytes. */
const EARLY_BYTES_LIMIT = 64 * 1024;

/** Where a peer whose address the transport could not learn is said to be. */
const UNKNOWN_ADDRESS = new InetAddress('0.0.0.0', 0);

/** The part of a NetherNet {@link Connection} the transport uses, so a test can stand one in. */
export type NetherNetPeer = Pick<Connection, 'id' | 'closed' | 'send' | 'close' | 'provesKey'> & {
    readonly peer: Pick<Connection['peer'], 'remoteAddress'>;
};

/**
 * The {@link NetherNetServer} surface {@link NetherNetTransport} consumes, narrowed so a test can
 * stand in a plain event emitter.
 */
export interface NetherNetTransportSource {
    on(event: 'openConnection', listener: (connection: NetherNetPeer) => void): unknown;
    on(event: 'closeConnection', listener: (connectionId: bigint, reason: string) => void): unknown;
    on(event: 'encapsulated', listener: (data: Buffer, connectionId: bigint) => void): unknown;
    close(reason?: string): void;
}

/** Where the transport reports peers opening, as detail, and warns of peers that never did. `Logger` fits. */
export interface NetherNetTransportLog {
    debug(message: string): void;
    warn(message: string): void;
}

/** Says where a NetherNet client connected from. */
export type NetherNetPeerAddress = (peer: NetherNetPeer) => InetAddress | undefined;

/**
 * Where the client is, read from the ICE candidate pair the peer connection chose. That is the
 * address the client's traffic really comes from, whichever signaling channel introduced it.
 */
export const selectedCandidateAddress: NetherNetPeerAddress = (peer) => {
    const remote = peer.peer.remoteAddress();
    return remote === undefined ? undefined : new InetAddress(remote.address, remote.port);
};

/**
 * One NetherNet peer as a {@link TransportConnection}. Frames go out on the reliable data
 * channel without their `0xFE` batch id, which NetherNet's wire does not carry.
 */
export class NetherNetTransportConnection implements TransportConnection {
    public readonly capabilities = NETHERNET_CAPABILITIES;
    public readonly transport = TransportNames.nethernet;

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

    /**
     * Closes the peer connection; the server then reports it closed with this reason. A kick is a
     * `DisconnectPacket` followed by this call, and the close needs no wait for it to arrive:
     * libdatachannel shuts SCTP down gracefully, which delivers what was sent before it.
     */
    public close(reason?: string): void {
        this.peer.close(reason);
    }

    /**
     * Whether the client's offer was signed with this key: its `a=identity` covers the DTLS
     * fingerprint the connection was made under.
     */
    public provesKey(identityPublicKey: string): Promise<boolean> {
        return this.peer.provesKey(identityPublicKey);
    }
}

/**
 * A {@link NetherNetServer} as a {@link Transport}. A message from a client becomes a frame with
 * the `0xFE` batch id put back in front, so the layers above read one format from every
 * transport.
 *
 * How the offer reached the server (LAN discovery on UDP 7551, or HTTP signaling on the game
 * port) is not this class's business: both feed the same NetherNet server.
 */
export default class NetherNetTransport extends KeyedTransport<NetherNetTransportConnection, bigint> {
    /** Messages from peers the server has not yet said are open, in arrival order. */
    private readonly early = new Map<bigint, Buffer[]>();

    /**
     * @param source - The NetherNet server whose connections this carries.
     * @param ids - The connection ID allocator every transport of the server shares.
     * @param peerAddress - Where a newly opened peer connected from, when anything knows.
     */
    public constructor(
        private readonly source: NetherNetTransportSource,
        ids: ConnectionIds,
        private readonly peerAddress: NetherNetPeerAddress = selectedCandidateAddress,
        private readonly log: NetherNetTransportLog = { debug: () => {}, warn: () => {} }
    ) {
        super(ids);
        // The NetherNet server keys a peer on the connection ID the client picked. That ID stays
        // in here: the server knows the connection by the one `accept` allocates.
        source.on('openConnection', (peer) => {
            const address = this.peerAddress(peer) ?? UNKNOWN_ADDRESS;
            const accepted = this.accept(peer.id, (id) => new NetherNetTransportConnection(id, peer, address));
            const early = this.early.get(peer.id) ?? [];
            this.early.delete(peer.id);
            if (accepted === undefined) return;
            this.log.debug(`NetherNet peer ${peer.id} opened from ${address} as connection ${accepted.id}`);
            for (const frame of early) this.receive(peer.id, frame);
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
            // The server delivers messages from a peer it has not yet said is open. Dropping
            // them loses a client's first packet, and the client then waits for a reply forever.
            const early = this.early.get(connectionId) ?? [];
            if (early.length >= EARLY_MESSAGE_LIMIT) return;
            const held = early.reduce((bytes, held) => bytes + held.byteLength, 0);
            if (held + frame.byteLength > EARLY_BYTES_LIMIT) return;
            early.push(frame);
            this.early.set(connectionId, early);
        });
    }

    /** Closes the NetherNet server, which closes every peer connection with it. */
    public close(): void {
        this.source.close('Server closed');
    }
}
