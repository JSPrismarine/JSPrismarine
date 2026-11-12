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
 * {@link ITransport} handed to a `Client`. Nothing here reads a clock or sets a timer.
 *
 * Each delivery reaches the server's listeners at once, in the order the client made it, and is
 * not waited on: the dispatcher keeps its own queue per connection, and a frame whose input waits
 * for the next tick must not hold up the pipe. A harness asks the server, not the pipe, whether
 * everything sent has been handled.
 */
export class LoopbackNetwork {
    private readonly connectListeners: Listener<[TransportConnection]>[] = [];
    private readonly disconnectListeners: Listener<[ConnectionId, InetAddress, string]>[] = [];
    private readonly frameListeners: Listener<[Buffer, ConnectionId]>[] = [];
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

    /** @internal Admits a client end, as RakNet's `openConnection` does. */
    public open(end: LoopbackClientEnd): Promise<void> {
        const id = this.ids.allocate();
        end.id = id;
        this.ends.set(id, end);
        const connection: TransportConnection = {
            id,
            // The pipe stands in for RakNet, the only name a connection may carry besides NetherNet.
            transport: 'RakNet',
            address: end.address,
            capabilities: LOOPBACK_CAPABILITIES,
            sendFrame: (payload) => end.receive(payload),
            close: (reason) => end.hangUp(reason ?? 'server disconnect')
        };
        // Awaited: a connection is admitted before the client sends its first frame.
        return this.deliver(this.connectListeners, (listener) => listener(connection));
    }

    /** @internal Hands one frame a client sent to the server. */
    public frame(end: LoopbackClientEnd, payload: Buffer): void {
        const id = end.id;
        if (id === undefined) return;
        void this.deliver(this.frameListeners, (listener) => listener(payload, id));
    }

    /** @internal Forgets a client end, as RakNet's `closeConnection` does, whichever side hung up. */
    public forget(end: LoopbackClientEnd, reason: string): void {
        const id = end.id;
        if (id === undefined || this.ends.get(id) !== end) return;
        this.ends.delete(id);
        void this.deliver(this.disconnectListeners, (listener) => listener(id, end.address, reason));
    }

    /** Calls each listener now, in order, and settles once they all have. */
    private async deliver<A extends unknown[]>(
        listeners: readonly Listener<A>[],
        call: (listener: Listener<A>) => Promise<void> | void
    ): Promise<void> {
        await Promise.all(listeners.map((listener) => call(listener)));
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
