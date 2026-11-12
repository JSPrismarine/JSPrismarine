import { InetAddress } from '@jsprismarine/raknet';
import type { ConnectionId } from '../network/transport/ConnectionId';
import { ConnectionIds } from '../network/transport/ConnectionId';
import { KeyedTransport } from '../network/transport/KeyedTransport';
import { Subscription } from '../network/transport/Subscription';
import type { Listener } from '../network/transport/Subscription';
import type { TransportCapabilities, TransportConnection } from '../network/transport/Transport';

/** RakNet's capabilities, which is what a test that does not care about them gets. */
export const plainCapabilities: TransportCapabilities = {
    encrypted: false,
    reliableOrdered: true,
    maxFrameSize: Number.POSITIVE_INFINITY
};

/** The address every manual connection reports. */
export const manualAddress = new InetAddress('127.0.0.1', 1);

/** A connection that records why it was closed and ignores what is written to it. */
export const manualConnection = (id: ConnectionId, closed: (string | undefined)[] = []): TransportConnection => ({
    id,
    address: manualAddress,
    capabilities: plainCapabilities,
    transport: 'RakNet',
    sendFrame: () => {},
    close: (reason) => void closed.push(reason)
});

/**
 * A transport a test feeds by hand, keyed by any string the test picks. Each call goes through
 * {@link KeyedTransport}'s ID allocation and ordering exactly as a real transport's library
 * events would.
 */
export class ManualTransport extends KeyedTransport<TransportConnection, string> {
    /** How many times {@link ManualTransport.close} ran. */
    public closes = 0;
    /** The reasons connections refused as duplicates were closed with. */
    public readonly refused: (string | undefined)[] = [];
    private readonly raw = new Subscription<[Buffer, InetAddress]>();

    /** @param ids - The allocator to draw from; a fresh one unless the test shares one. */
    public constructor(ids: ConnectionIds = new ConnectionIds()) {
        super(ids);
    }

    public close(): void {
        this.closes += 1;
    }

    public onRaw(listener: Listener<[Buffer, InetAddress]>): void {
        this.raw.add(listener);
    }

    /** Accepts a peer under `key`; returns its ID, or undefined when the key is taken. */
    public connect(key: string): ConnectionId | undefined {
        return this.accept(key, (id) => manualConnection(id, this.refused))?.id;
    }

    public frame(key: string, payload: string): void {
        this.receive(key, Buffer.from(payload));
    }

    public disconnect(key: string, reason: string): void {
        this.forget(key, reason);
    }

    public sendRaw(payload: string): Promise<void> {
        return this.raw.deliver(Buffer.from(payload), manualAddress);
    }
}

/** Resolves once every queued macrotask and the microtasks before it have run. */
export const settle = (): Promise<void> => new Promise((resolve) => setImmediate(resolve));

/** A promise and the function that resolves it, to wait on a callback rather than a timer a test may fake. */
export const deferred = (): { promise: Promise<void>; resolve: () => void } => {
    let resolve!: () => void;
    const promise = new Promise<void>((done) => (resolve = done));
    return { promise, resolve };
};
