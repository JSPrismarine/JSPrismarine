import type { InetAddress } from '@jsprismarine/raknet';

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
 * One client's duplex byte-frame channel. It knows nothing about Minecraft packets: a frame
 * is an opaque payload, already batched, compressed, and encrypted by the layers above as
 * {@link TransportConnection.capabilities} requires.
 */
export interface TransportConnection {
    /** Identifies the connection for the life of the transport; the session registry keys on it. */
    readonly token: string;
    /** What this connection's transport does on its own - see {@link TransportCapabilities}. */
    readonly capabilities: TransportCapabilities;
    /**
     * Queues one frame for the client.
     * @param payload - The frame's bytes, ready for the wire.
     * @param immediate - Send in a datagram of its own instead of the next scheduled flush.
     */
    sendFrame(payload: Buffer, immediate?: boolean): void;
    /**
     * Hangs up on the client.
     * @param reason - Recorded as the disconnect reason the transport reports back.
     */
    close(reason?: string): void;
}

/**
 * A listening transport: accepts connections and surfaces what arrives on them.
 *
 * Subscriptions rather than an event-map emitter, so each listener keeps its own signature.
 * Listeners of one subscription run in order, each awaited before the next.
 * @typeParam C - The transport's own connection type, for a consumer that needs more than
 * the {@link TransportConnection} contract while the legacy RakNet events still exist.
 */
export interface Transport<C extends TransportConnection = TransportConnection> {
    /** Calls the listener once per accepted connection. */
    onConnect(listener: (connection: C) => Promise<void> | void): void;
    /** Calls the listener when the transport forgets a connection, however it ended. */
    onDisconnect(listener: (address: InetAddress, reason: string) => Promise<void> | void): void;
    /** Calls the listener with each frame a connected client sent. */
    onFrame(listener: (payload: Buffer, address: InetAddress) => Promise<void> | void): void;
    /** Calls the listener with datagrams from hosts that are not connected, such as queries. */
    onRaw(listener: (payload: Buffer, address: InetAddress) => Promise<void> | void): void;
    /** Stops listening and drops every connection. */
    close(): void;
}
