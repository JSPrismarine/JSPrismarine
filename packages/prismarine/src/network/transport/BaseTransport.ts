import type { InetAddress } from '@jsprismarine/raknet';
import type { ConnectionId } from './ConnectionId';
import type { Listener } from './Subscription';
import { Subscription } from './Subscription';
import type { Transport, TransportConnection } from './Transport';

/**
 * The part of a {@link Transport} that has nothing to do with any wire: holding subscriptions
 * and keeping one connection's events from overtaking each other.
 *
 * A transport over a wire extends `KeyedTransport`, which adds the mapping from the wire's peer
 * keys to connection IDs; a transport that only forwards another's events, such as
 * `MultiTransport`, extends this directly.
 * @typeParam C - The transport's own connection type.
 */
export abstract class BaseTransport<C extends TransportConnection> implements Transport<C> {
    private readonly connects = new Subscription<[C]>();
    private readonly disconnects = new Subscription<[ConnectionId, InetAddress, string]>();
    private readonly frames = new Subscription<[Buffer, ConnectionId]>();
    /** Connect, frames, and close must not overtake one another while handlers await. */
    private readonly deliveries = new Map<ConnectionId, Promise<void>>();

    /** Calls the listener once per accepted connection. */
    public onConnect(listener: Listener<[C]>): void {
        this.connects.add(listener);
    }

    /** Calls the listener when the transport forgets a connection, with the reason it recorded. */
    public onDisconnect(listener: Listener<[ConnectionId, InetAddress, string]>): void {
        this.disconnects.add(listener);
    }

    /** Calls the listener with each frame a connected client sent. */
    public onFrame(listener: Listener<[Buffer, ConnectionId]>): void {
        this.frames.add(listener);
    }

    /** Stops listening and drops every connection. */
    public abstract close(): void;

    /** Runs the connect listeners, in order, for one accepted connection. */
    protected deliverConnect(connection: C): Promise<void> {
        return this.connects.deliver(connection);
    }

    /** Runs the disconnect listeners, in order. */
    protected deliverDisconnect(id: ConnectionId, address: InetAddress, reason: string): Promise<void> {
        return this.disconnects.deliver(id, address, reason);
    }

    /** Runs the frame listeners, in order, with one frame's payload. */
    protected deliverFrame(payload: Buffer, id: ConnectionId): Promise<void> {
        return this.frames.deliver(payload, id);
    }

    /**
     * Queues one delivery behind every earlier one for the same connection.
     *
     * A failing delivery is still fatal, as an async listener failure was on the event emitter
     * this replaced, but it does not leave that connection's later deliveries queued forever.
     * @param id - The connection the delivery belongs to.
     * @param deliver - The delivery, which may await listeners.
     */
    protected enqueue(id: ConnectionId, deliver: () => Promise<void>): void {
        const previous = this.deliveries.get(id) ?? Promise.resolve();
        const current = previous.catch(() => {}).then(deliver);
        this.deliveries.set(id, current);

        const clear = () => {
            if (this.deliveries.get(id) === current) this.deliveries.delete(id);
        };
        void current.then(clear, (error: unknown) => {
            clear();
            queueMicrotask(() => {
                throw error;
            });
        });
    }
}
