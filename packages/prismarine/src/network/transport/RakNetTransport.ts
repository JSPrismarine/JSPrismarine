import type { InetAddress, RakNetSession } from '@jsprismarine/raknet';
import { ConnectionPriority, Protocol } from '@jsprismarine/raknet';
import type { EventEmitter } from '../../events/EventEmitter';
import RaknetConnectEvent from '../../events/raknet/RaknetConnectEvent';
import RaknetEncapsulatedPacketEvent from '../../events/raknet/RaknetEncapsulatedPacketEvent';
import type { Transport, TransportCapabilities, TransportConnection } from './Transport';

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
export type RaknetEventBus = Pick<EventEmitter, 'emit'>;

/**
 * One RakNet session as a {@link TransportConnection}: frames leave reliable ordered on
 * channel 0, which is where the order index the client applies things in is stamped.
 */
export class RakNetTransportConnection implements TransportConnection {
    public readonly token: string;
    public readonly capabilities = RAKNET_CAPABILITIES;

    public constructor(private readonly session: RakNetSession) {
        this.token = session.getAddress().toToken();
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

    /**
     * The session underneath, for what the transport seam does not cover yet: the legacy
     * `RaknetConnectEvent` payload and the address the login handler gives the player.
     */
    public getRakNetSession(): RakNetSession {
        return this.session;
    }

    /** The client's address, which is what the token is derived from. */
    public getAddress(): InetAddress {
        return this.session.getAddress();
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
export default class RakNetTransport implements Transport<RakNetTransportConnection> {
    private readonly connectListeners: ((connection: RakNetTransportConnection) => Promise<void> | void)[] = [];
    private readonly disconnectListeners: ((address: InetAddress, reason: string) => Promise<void> | void)[] = [];
    private readonly frameListeners: ((payload: Buffer, address: InetAddress) => Promise<void> | void)[] = [];
    private readonly rawListeners: ((payload: Buffer, address: InetAddress) => Promise<void> | void)[] = [];

    public constructor(
        private readonly source: RakNetTransportSource,
        private readonly events: RaknetEventBus
    ) {
        source.on('openConnection', (session) => void this.handleOpenConnection(session));
        source.on('closeConnection', (address, reason) => {
            void this.deliver(this.disconnectListeners, (listener) => listener(address, reason));
        });
        source.on('encapsulated', (frame, address) => void this.handleEncapsulated(frame, address));
        source.on('raw', (buffer, address) => {
            void this.deliver(this.rawListeners, (listener) => listener(buffer, address));
        });
    }

    /** Calls the listener once per session RakNet accepts, unless the connect event was canceled. */
    public onConnect(listener: (connection: RakNetTransportConnection) => Promise<void> | void): void {
        this.connectListeners.push(listener);
    }

    /** Calls the listener when RakNet forgets a session, with the reason it recorded. */
    public onDisconnect(listener: (address: InetAddress, reason: string) => Promise<void> | void): void {
        this.disconnectListeners.push(listener);
    }

    /** Calls the listener with each encapsulated frame's content. */
    public onFrame(listener: (payload: Buffer, address: InetAddress) => Promise<void> | void): void {
        this.frameListeners.push(listener);
    }

    /** Calls the listener with offline datagrams, which is where the query protocol lives. */
    public onRaw(listener: (payload: Buffer, address: InetAddress) => Promise<void> | void): void {
        this.rawListeners.push(listener);
    }

    /** Kills the listener underneath, which drops every session with it. */
    public close(): void {
        this.source.kill();
    }

    private async handleOpenConnection(session: RakNetSession): Promise<void> {
        const event = new RaknetConnectEvent(session);
        await this.events.emit('raknetConnect', event);

        if (event.isCanceled()) {
            session.disconnect();
            return;
        }

        const connection = new RakNetTransportConnection(session);
        await this.deliver(this.connectListeners, (listener) => listener(connection));
    }

    private async handleEncapsulated(frame: Protocol.Frame, address: InetAddress): Promise<void> {
        const event = new RaknetEncapsulatedPacketEvent(address, frame);
        await this.events.emit('raknetEncapsulatedPacket', event);

        await this.deliver(this.frameListeners, (listener) => listener(frame.content, address));
    }

    private async deliver<L>(listeners: readonly L[], call: (listener: L) => Promise<void> | void): Promise<void> {
        for (const listener of listeners) await call(listener);
    }
}
