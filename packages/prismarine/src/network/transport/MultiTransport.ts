import type { InetAddress } from '@jsprismarine/raknet';
import { BaseTransport } from './BaseTransport';
import { ConnectionIds } from './ConnectionId';
import type { Listener } from './Subscription';
import { Subscription } from './Subscription';
import type { Transport, TransportConnection } from './Transport';

/**
 * Several transports presented as one, so the dispatcher above serves RakNet and NetherNet
 * clients (and, later, Java ones) through a single subscription.
 *
 * This owns the connection ID allocator and hands it to every child it builds, so all of them
 * number their connections from one sequence and no two connections, whatever carried them,
 * share an ID. Each child already delivers one connection's events in order, so events are
 * forwarded as they come: a child awaits the forwarded delivery, which keeps its own ordering
 * intact through here.
 */
export default class MultiTransport extends BaseTransport<TransportConnection> {
    private readonly raw = new Subscription<[Buffer, InetAddress]>();
    private readonly transports: readonly Transport[];

    /**
     * @param build - Builds the transports to merge, each drawing connection IDs from the
     * allocator it is given. Their connections reach listeners as the
     * {@link TransportConnection} contract, whichever transport accepted them.
     */
    public constructor(build: (ids: ConnectionIds) => readonly Transport[]) {
        super();
        this.transports = build(new ConnectionIds());
        for (const transport of this.transports) {
            transport.onConnect((connection) => this.deliverConnect(connection));
            transport.onDisconnect((id, address, reason) => this.deliverDisconnect(id, address, reason));
            transport.onFrame((payload, id) => this.deliverFrame(payload, id));
            transport.onRaw?.((payload, address) => this.raw.deliver(payload, address));
        }
    }

    /** Calls the listener with the raw datagrams of every child transport that carries them. */
    public onRaw(listener: Listener<[Buffer, InetAddress]>): void {
        this.raw.add(listener);
    }

    /** Closes every child transport, even when one of them throws. */
    public close(): void {
        const errors: unknown[] = [];
        for (const transport of this.transports) {
            try {
                transport.close();
            } catch (error: unknown) {
                errors.push(error);
            }
        }
        if (errors.length === 1) throw errors[0];
        if (errors.length > 1) throw new AggregateError(errors, 'Several transports failed to close');
    }
}
