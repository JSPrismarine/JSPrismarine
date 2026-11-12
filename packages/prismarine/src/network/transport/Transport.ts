import type { InetAddress } from '@jsprismarine/raknet';
import type { ConnectionId } from './ConnectionId';

/** The display name of each transport a connection can arrive over, keyed by a lowercase id. */
export const TransportNames = { raknet: 'RakNet', nethernet: 'NetherNet' } as const;

/** One of {@link TransportNames}: `RakNet` or `NetherNet`. */
export type TransportName = (typeof TransportNames)[keyof typeof TransportNames];

/**
 * What a transport does for the session layer, so the layers above can decide what they
 * still have to do themselves: batch, compress, encrypt, or re-order.
 */
export interface TransportCapabilities {
    /** Whether the transport encrypts frames itself, as a WebRTC data channel does. */
    readonly encrypted: boolean;
    /** Whether frames arrive exactly once and in the order they were framed. */
    readonly reliableOrdered: boolean;
    /** The most payload bytes one {@link TransportConnection.sendFrame} call may carry. */
    readonly maxFrameSize: number;
}

/**
 * One client's duplex byte-frame channel. It knows nothing about the packets it carries: a
 * frame is an opaque payload, already batched, compressed, and encrypted by the layers above as
 * {@link TransportConnection.capabilities} requires.
 *
 * A Bedrock frame is a batch in the form RakNet carries it, starting with the `0xFE` batch id. A
 * transport whose wire leaves that byte out, as NetherNet's does, adds it to what it receives and
 * strips it from what it sends, so the batch and encryption codecs above see one format.
 */
export interface TransportConnection {
    /**
     * The server's ID for this connection, drawn from the allocator every transport of the
     * server shares, so no two live or past connections have the same one.
     */
    readonly id: ConnectionId;
    /**
     * Where the client connected from: an IP address and port, whichever transport carried it.
     * `InetAddress` is the value type for that, not a RakNet dependency of the seam. Several
     * connections may share one, and an address may come back on a later connection.
     */
    readonly address: InetAddress;
    /** What this connection's transport does on its own - see {@link TransportCapabilities}. */
    readonly capabilities: TransportCapabilities;
    /** The transport this connection arrived over. */
    readonly transport: TransportName;
    /**
     * Queues one frame for the client.
     * @param payload - The frame's bytes, ready for the wire.
     * @param immediate - Send in a datagram of its own instead of the next scheduled flush.
     */
    sendFrame(payload: Buffer, immediate?: boolean): void;
    /**
     * Hangs up on the client, after what was already sent has had its chance to arrive.
     *
     * RakNet holds the session open until the client acknowledges its last datagrams, so it
     * hangs up at once. A transport that would drop frames still in flight waits for them
     * first and returns a promise that settles once it has hung up, so a caller that sent a
     * goodbye can wait for it to arrive before the process exits.
     * @param reason - Recorded as the disconnect reason the transport reports back.
     */
    close(reason?: string): Promise<void> | void;
    /**
     * Whether the client proved, while connecting, that it holds a key. Only a transport that
     * encrypts the wire itself has this: there the session leaves Minecraft's encryption off, and
     * with it the handshake that proves a login's identity key, so the transport's own handshake
     * has to prove it, or a login somebody recorded could be sent again by anybody.
     * @param identityPublicKey - The key a login names, as base64 DER.
     * @returns False when the client proved another key or none.
     */
    provesKey?(identityPublicKey: string): Promise<boolean>;
}

/**
 * A listening transport: accepts connections and surfaces what arrives on them.
 *
 * Subscriptions rather than an event-map emitter, so each listener keeps its own signature.
 * Listeners of one subscription run in order, each awaited before the next. A transport
 * delivers one connection's connect, frames and disconnect in order, none overtaking another.
 * @typeParam C - The transport's own connection type, for a consumer that needs more than
 * the {@link TransportConnection} contract.
 */
export interface Transport<C extends TransportConnection = TransportConnection> {
    /** Calls the listener once per accepted connection. */
    onConnect(listener: (connection: C) => Promise<void> | void): void;
    /**
     * Calls the listener when the transport forgets a connection, however it ended. It also runs
     * for a connection whose connect never reached {@link Transport.onConnect} listeners.
     */
    onDisconnect(listener: (id: ConnectionId, address: InetAddress, reason: string) => Promise<void> | void): void;
    /** Calls the listener with each frame a connected client sent, and the connection's ID. */
    onFrame(listener: (payload: Buffer, id: ConnectionId) => Promise<void> | void): void;
    /**
     * Calls the listener with datagrams from hosts that are not connected, such as queries.
     * Only a transport that shares its socket with such traffic implements it.
     */
    onRaw?(listener: (payload: Buffer, address: InetAddress) => Promise<void> | void): void;
    /** Stops listening and drops every connection. */
    close(): void;
}
