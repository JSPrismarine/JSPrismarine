import type { InetAddress, RakNetSession } from '@jsprismarine/raknet';
import { ConnectionPriority, Protocol } from '@jsprismarine/raknet';
import type { EventEmitter } from '../../events/EventEmitter';
import RaknetConnectEvent from '../../events/raknet/RaknetConnectEvent';
import RaknetEncapsulatedPacketEvent from '../../events/raknet/RaknetEncapsulatedPacketEvent';
import type { ConnectionId, ConnectionIds } from './ConnectionId';
import { KeyedTransport } from './KeyedTransport';
import type { Listener } from './Subscription';
import { Subscription } from './Subscription';
import type { TransportCapabilities, TransportConnection } from './Transport';

/**
 * What RakNet does on its own: everything leaves here reliable ordered, split over as many
 * datagrams as the MTU demands, and nothing is encrypted. Compression stays above.
 */
const RAKNET_CAPABILITIES: TransportCapabilities = {
    encrypted: false,
    reliableOrdered: true,
    // RakNet fragments a frame over datagrams itself, so no payload size is refused here.
    maxFrameSize: Number.POSITIVE_INFINITY
};

/**
 * The RakNet surface {@link RakNetTransport} consumes, narrowed so a test can stand in a
 * plain event emitter with a `kill`. `RakNetListener` satisfies it structurally.
 */
export interface RakNetTransportSource {
    on(event: 'openConnection', listener: (session: RakNetSession) => void): unknown;
    on(event: 'closeConnection', listener: (address: InetAddress, reason: string) => void): unknown;
    on(event: 'encapsulated', listener: (frame: Protocol.Frame, address: InetAddress) => void): unknown;
    on(event: 'raw', listener: (buffer: Buffer, address: InetAddress) => void): unknown;
    kill(): void;
}

/** Where the legacy `raknetConnect`/`raknetEncapsulatedPacket` events still go: the server's bus. */
export type RaknetEventBus = Pick<EventEmitter, 'emit' | 'hasListeners'>;

/**
 * One RakNet session as a {@link TransportConnection}: frames leave reliable ordered on
 * channel 0, which is where the order index the client applies things in is stamped.
 */
export class RakNetTransportConnection implements TransportConnection {
    public readonly address: InetAddress;
    public readonly capabilities = RAKNET_CAPABILITIES;

    public constructor(
        public readonly id: ConnectionId,
        private readonly session: RakNetSession
    ) {
        this.address = session.getAddress();
    }

    /** Queues the payload reliable ordered; `immediate` forces a datagram of its own. */
    public sendFrame(payload: Buffer, immediate = false): void {
        const frame = new Protocol.Frame();
        frame.reliability = Protocol.FrameReliability.RELIABLE_ORDERED;
        frame.orderChannel = 0;
        frame.content = payload;
        this.session.sendFrame(frame, immediate ? ConnectionPriority.IMMEDIATE : ConnectionPriority.NORMAL);
    }

    /** Queues the goodbye and lets RakNet tear the session down. */
    public close(reason?: string): void {
        if (reason === undefined) this.session.disconnect();
        else this.session.disconnect(reason);
    }

    /** The session underneath, for the legacy `RaknetConnectEvent` payload. */
    public getRakNetSession(): RakNetSession {
        return this.session;
    }
}

/**
 * `RakNetListener` as a {@link Transport}: `openConnection` becomes `connect`,
 * `encapsulated` becomes `frame` (the frame's content, with RakNet's envelope stripped),
 * and `raw` stays as it is for the query protocol.
 *
 * The legacy `raknetConnect` and `raknetEncapsulatedPacket` events are emitted here, where
 * their RakNet-typed payloads live, at the same point in the flow as before: awaited before
 * the transport listeners run, with a canceled connect disconnecting the session and never
 * reaching them. `raknetDisconnect` is the exception - its emission order is tied to the
 * session registry, so it stays with the dispatcher.
 */
export default class RakNetTransport extends KeyedTransport<RakNetTransportConnection, string> {
    private readonly raw = new Subscription<[Buffer, InetAddress]>();

    /**
     * @param source - The RakNet listener whose sessions this carries.
     * @param events - Where the legacy RakNet events go.
     * @param ids - The connection ID allocator every transport of the server shares.
     */
    public constructor(
        private readonly source: RakNetTransportSource,
        private readonly events: RaknetEventBus,
        ids: ConnectionIds
    ) {
        super(ids);
        // RakNet keys a session on the client's address and port, and frees it the moment the
        // session ends, so a client reconnecting from the same port is a new key registration.
        source.on('openConnection', (session) => {
            this.accept(
                session.getAddress().toToken(),
                (id) => new RakNetTransportConnection(id, session),
                (connection) => this.admit(connection)
            );
        });
        source.on('closeConnection', (address, reason) => this.forget(address.toToken(), reason));
        source.on('encapsulated', (frame, address) => {
            const connection = this.connectionOf(address.toToken());
            if (connection === undefined) return;
            this.enqueue(connection.id, () => this.handleEncapsulated(frame, address, connection.id));
        });
        source.on('raw', (buffer, address) => {
            void this.raw.deliver(buffer, address);
        });
    }

    /** Calls the listener with offline datagrams, which is where the query protocol lives. */
    public onRaw(listener: Listener<[Buffer, InetAddress]>): void {
        this.raw.add(listener);
    }

    /** Kills the listener underneath, which drops every session with it. */
    public close(): void {
        this.source.kill();
    }

    /** Runs the legacy connect event; a canceled one hangs up before anyone hears of the session. */
    private async admit(connection: RakNetTransportConnection): Promise<boolean> {
        const session = connection.getRakNetSession();
        const event = new RaknetConnectEvent(session);
        await this.events.emit('raknetConnect', event);

        if (event.isCanceled()) {
            session.disconnect();
            return false;
        }
        return true;
    }

    private async handleEncapsulated(frame: Protocol.Frame, address: InetAddress, id: ConnectionId): Promise<void> {
        // Most servers have no plugin subscribed to raw frames, so avoid an event allocation
        // and an async emit on the busiest inbound path in that common case.
        if (this.events.hasListeners('raknetEncapsulatedPacket')) {
            const event = new RaknetEncapsulatedPacketEvent(address, frame);
            await this.events.emit('raknetEncapsulatedPacket', event);
        }

        await this.deliverFrame(frame.content, id);
    }
}
