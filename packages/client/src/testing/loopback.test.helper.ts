import { ConnectionIds } from '@jsprismarine/prismarine/network/transport/ConnectionId';
import type { ConnectionId } from '@jsprismarine/prismarine/network/transport/ConnectionId';
import type {
    Transport,
    TransportCapabilities,
    TransportConnection
} from '@jsprismarine/prismarine/network/transport/Transport';
import { InetAddress } from '@jsprismarine/raknet';
import { EventEmitter } from 'node:events';

import type { ITransport, TransportEvents, TransportStats } from '../net/ITransport';

/** What an in-process pipe gives: frames arrive once, in order, unencrypted, of any size. */
const LOOPBACK_CAPABILITIES: TransportCapabilities = {
    encrypted: false,
    reliableOrdered: true,
    maxFrameSize: Number.POSITIVE_INFINITY
};

type Listener<A extends unknown[]> = (...args: A) => Promise<void> | void;

/**
 * Clients and a server in one process, joined by in-memory pipes instead of sockets.
 *
 * The server end is a {@link Transport} handed to the `Server` constructor; each client end is an
 * {@link ITransport} handed to a `Client`. Nothing here reads a clock or sets a timer, and every
 * delivery to the server is tracked, so a harness can wait until the server has handled
 * everything the clients sent and then step the next tick by hand.
 *
 * Deliveries for one connection run one after another, connect first and close last, as
 * `RakNetTransport` orders them.
 */
export class LoopbackNetwork {
    private readonly connectListeners: Listener<[TransportConnection]>[] = [];
    private readonly disconnectListeners: Listener<[ConnectionId, InetAddress, string]>[] = [];
    private readonly frameListeners: Listener<[Buffer, ConnectionId]>[] = [];
    private readonly deliveries = new Map<ConnectionId, Promise<void>>();
    private readonly inFlight = new Set<Promise<void>>();
    private readonly ends = new Map<ConnectionId, LoopbackClientEnd>();
    /** Numbers connections 1, 2, 3 as a fresh server's transports do, so a trace's IDs line up. */
    private readonly ids = new ConnectionIds();
    private nextPort = 50_000;

    /** The server's end: give it to `new Server({ transport })`. */
    public readonly transport: Transport = {
        onConnect: (listener) => void this.connectListeners.push(listener),
        onDisconnect: (listener) => void this.disconnectListeners.push(listener),
        onFrame: (listener) => void this.frameListeners.push(listener),
        close: () => {
            for (const end of [...this.ends.values()]) end.hangUp('server closed');
        }
    };

    /** A new client end, with an address of its own. Hand it to `new Client({ transport })`. */
    public client(): ITransport {
        const address = new InetAddress('127.0.0.1', this.nextPort++);
        return new LoopbackClientEnd(this, address);
    }

    /** The ID the server's session registry knows each connected client by. */
    public connectionIds(): readonly ConnectionId[] {
        return [...this.ends.keys()];
    }

    /** Whether the server has handled every connect, frame and close delivered so far. */
    public isIdle(): boolean {
        return this.inFlight.size === 0;
    }

    /** Resolves once {@link LoopbackNetwork.isIdle} holds, including for deliveries made meanwhile. */
    public async idle(): Promise<void> {
        while (this.inFlight.size > 0) await Promise.allSettled([...this.inFlight]);
    }

    /** @internal Admits a client end, as RakNet's `openConnection` does. */
    public open(end: LoopbackClientEnd): Promise<void> {
        const id = this.ids.allocate();
        end.id = id;
        this.ends.set(id, end);
        const connection: TransportConnection = {
            id,
            address: end.address,
            capabilities: LOOPBACK_CAPABILITIES,
            sendFrame: (payload) => end.receive(payload),
            close: (reason) => end.hangUp(reason ?? 'server disconnect')
        };
        return this.deliver(id, this.connectListeners, (listener) => listener(connection));
    }

    /** @internal Hands one frame a client sent to the server. */
    public frame(end: LoopbackClientEnd, payload: Buffer): void {
        const id = end.id;
        if (id === undefined) return;
        void this.deliver(id, this.frameListeners, (listener) => listener(payload, id));
    }

    /** @internal Forgets a client end, as RakNet's `closeConnection` does, whichever side hung up. */
    public forget(end: LoopbackClientEnd, reason: string): void {
        const id = end.id;
        if (id === undefined || this.ends.get(id) !== end) return;
        this.ends.delete(id);
        void this.deliver(id, this.disconnectListeners, (listener) => listener(id, end.address, reason));
    }

    private deliver<A extends unknown[]>(
        id: ConnectionId,
        listeners: readonly Listener<A>[],
        call: (listener: Listener<A>) => Promise<void> | void
    ): Promise<void> {
        const previous = this.deliveries.get(id) ?? Promise.resolve();
        const current = previous.then(async () => {
            for (const listener of listeners) await call(listener);
        });
        const tracked = current.catch(() => {});
        this.deliveries.set(id, tracked);
        this.inFlight.add(tracked);
        void tracked.finally(() => this.inFlight.delete(tracked));
        return current;
    }
}

/** One client's end of a {@link LoopbackNetwork} pipe. */
class LoopbackClientEnd implements ITransport {
    private readonly events = new EventEmitter();
    private open = false;
    private bytesSent = 0;
    private bytesReceived = 0;
    private packetsSent = 0;
    private packetsReceived = 0;
    /** The server's ID for this end, set once the server admits it. */
    public id: ConnectionId | undefined;

    public constructor(
        private readonly network: LoopbackNetwork,
        public readonly address: InetAddress
    ) {}

    public async connect(): Promise<void> {
        this.open = true;
        await this.network.open(this);
    }

    public send(payload: Buffer): void {
        if (!this.open) return;
        this.bytesSent += payload.byteLength;
        this.packetsSent++;
        this.network.frame(this, payload);
    }

    public on<E extends keyof TransportEvents>(event: E, listener: TransportEvents[E]): void {
        this.events.on(event, listener);
    }

    public off<E extends keyof TransportEvents>(event: E, listener: TransportEvents[E]): void {
        this.events.off(event, listener);
    }

    public close(reason = 'client disconnect'): void {
        this.hangUp(reason);
    }

    public getStats(): TransportStats {
        return {
            rtt: 0,
            bytesSent: this.bytesSent,
            bytesReceived: this.bytesReceived,
            packetsSent: this.packetsSent,
            packetsReceived: this.packetsReceived
        };
    }

    /** A frame the server sent. The client queues it for decoding before this returns. */
    public receive(payload: Buffer): void {
        if (!this.open) return;
        this.bytesReceived += payload.byteLength;
        this.packetsReceived++;
        this.events.emit('batch', payload);
    }

    /** Ends the pipe once, telling both sides. */
    public hangUp(reason: string): void {
        if (!this.open) return;
        this.open = false;
        this.network.forget(this, reason);
        this.events.emit('close', reason);
    }
}
