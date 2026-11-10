import { BaseTransport } from './BaseTransport';
import type { ConnectionId, ConnectionIds } from './ConnectionId';
import type { TransportConnection } from './Transport';

/**
 * A {@link BaseTransport} over a wire that names its peers its own way: RakNet by address and
 * port, NetherNet by the connection ID the client picked. This keeps that key private to the
 * transport and gives every accepted peer a {@link ConnectionId} from the allocator the server's
 * transports share, so nothing above can mistake one transport's peer for another's, or a
 * reconnecting client for the connection it replaced.
 *
 * A key belongs to at most one live connection. A peer that disconnects frees its key at once,
 * and the same key coming back later is a new connection with a new ID.
 * @typeParam C - The transport's own connection type.
 * @typeParam K - The wire's key for a peer.
 */
export abstract class KeyedTransport<C extends TransportConnection, K> extends BaseTransport<C> {
    private readonly connections = new Map<K, C>();

    /** @param ids - The allocator every transport of the server draws from. */
    protected constructor(private readonly ids: ConnectionIds) {
        super();
    }

    /**
     * Registers a peer the wire has accepted and delivers its connect.
     * @param key - The wire's key for the peer.
     * @param build - Makes the connection once its ID is known.
     * @param admit - Decides, before connect listeners hear of it, whether the connection is
     * announced at all. A refused one stays registered until the wire reports it gone, so its
     * disconnect is still delivered.
     * @returns The registered connection, or undefined when the key already has a live one, in
     * which case the newcomer is closed.
     */
    protected accept(
        key: K,
        build: (id: ConnectionId) => C,
        admit: (connection: C) => Promise<boolean> | boolean = () => true
    ): C | undefined {
        const connection = build(this.ids.allocate());
        if (this.connections.has(key)) {
            connection.close('Duplicate connection');
            return undefined;
        }

        this.connections.set(key, connection);
        this.enqueue(connection.id, async () => {
            if (await admit(connection)) await this.deliverConnect(connection);
        });
        return connection;
    }

    /**
     * The live connection the wire knows by this key.
     * @param key - The wire's key for the peer.
     */
    protected connectionOf(key: K): C | undefined {
        return this.connections.get(key);
    }

    /**
     * Delivers one frame from the peer. A frame for a key with no live connection is dropped:
     * it belongs to a connection already forgotten or never accepted.
     * @param key - The wire's key for the peer.
     * @param payload - The frame, in the form {@link TransportConnection} documents.
     */
    protected receive(key: K, payload: Buffer): void {
        const connection = this.connections.get(key);
        if (connection === undefined) return;
        this.enqueue(connection.id, () => this.deliverFrame(payload, connection.id));
    }

    /**
     * Forgets the peer and delivers its disconnect, behind everything already queued for it.
     * @param key - The wire's key for the peer.
     * @param reason - Why the wire says it ended.
     */
    protected forget(key: K, reason: string): void {
        const connection = this.connections.get(key);
        if (connection === undefined) return;
        this.connections.delete(key);
        this.enqueue(connection.id, () => this.deliverDisconnect(connection.id, connection.address, reason));
    }
}
