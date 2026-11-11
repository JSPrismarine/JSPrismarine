import Dgram from 'node:dgram';
import type { RemoteInfo } from 'node:dgram';

import type { DatagramListener, DatagramSource } from './DatagramSource';
import SharedByteRing from './SharedByteRing';

/** The bytes before each datagram in a ring: family (4 or 6), reserved, port (LE), 16 address bytes. */
export const RING_DATAGRAM_HEADER_BYTES = 20;

/** Each ring's capacity unless the caller picks one: room for a burst at full speed. */
export const DEFAULT_DATAGRAM_RING_CAPACITY = 4 * 1024 * 1024;

/** The shared memory of a pair of datagram rings, as it crosses to a worker thread. */
export interface DatagramRings {
    /** Written by the port's owner, read by RakNet. */
    readonly inbound: SharedArrayBuffer;
    /** Written by RakNet, read by the port's owner. */
    readonly outbound: SharedArrayBuffer;
}

/** A shared port as a worker thread receives it: the rings, the address family and the port. */
export interface WorkerSharedPort extends DatagramRings {
    readonly family: 4 | 6;
    readonly port: number;
}

/**
 * Hands the rings to the port's owner once RakNet can be woken.
 * @param wakePort - The loopback UDP port RakNet listens on for a wake after inbound writes.
 * @returns The loopback UDP port the owner listens on for a wake after outbound writes.
 */
export type AttachRings = (wakePort: number) => number | Promise<number>;

/**
 * Allocates the shared memory of a pair of rings in the layout {@link SharedByteRing} has.
 * @param capacity - Each ring's capacity, a power of two.
 * @returns The memory.
 */
export const allocateDatagramRings = (capacity = DEFAULT_DATAGRAM_RING_CAPACITY): DatagramRings => ({
    inbound: new SharedArrayBuffer(SharedByteRing.byteLength(capacity)),
    outbound: new SharedArrayBuffer(SharedByteRing.byteLength(capacity))
});

const capacityOf = (memory: SharedArrayBuffer): number => memory.byteLength - SharedByteRing.byteLength(0);

/** An address as the ring header carries it: 4 or 16 bytes, from the text form. */
const writeAddress = (header: Buffer, address: string, family: 4 | 6): void => {
    if (family === 4) {
        const parts = address.split('.').map(Number);
        for (let index = 0; index < 4; index++) header[4 + index] = parts[index] ?? 0;
        return;
    }
    // Expand `::` into the zero groups it stands for.
    const [head = '', tail = ''] = address.includes('::') ? address.split('::') : [address, ''];
    const headGroups = head === '' ? [] : head.split(':');
    const tailGroups = tail === '' ? [] : tail.split(':');
    const groups = [
        ...headGroups,
        ...Array<string>(Math.max(0, 8 - headGroups.length - tailGroups.length)).fill('0'),
        ...tailGroups
    ];
    for (let index = 0; index < 8; index++)
        header.writeUInt16BE(Number.parseInt(groups[index] ?? '0', 16), 4 + index * 2);
};

/** An address from the ring header, in the text form Node.js gives a `RemoteInfo`. */
const readAddress = (record: Buffer, family: 4 | 6): string => {
    if (family === 4) return `${record[4]}.${record[5]}.${record[6]}.${record[7]}`;
    const groups: string[] = [];
    for (let index = 0; index < 8; index++) groups.push(record.readUInt16BE(4 + index * 2).toString(16));
    // The longest run of zero groups becomes `::`, as RFC 5952 writes an address.
    let bestStart = -1;
    let bestLength = 0;
    for (let start = 0; start < 8;) {
        if (groups[start] !== '0') {
            start++;
            continue;
        }
        let end = start;
        while (end < 8 && groups[end] === '0') end++;
        if (end - start > bestLength && end - start > 1) {
            bestStart = start;
            bestLength = end - start;
        }
        start = end;
    }
    if (bestStart < 0) return groups.join(':');
    return `${groups.slice(0, bestStart).join(':')}::${groups.slice(bestStart + bestLength).join(':')}`;
};

/**
 * A port another component owns and shares with RakNet, reached through two rings in shared
 * memory: the owner writes each RakNet datagram it receives into the inbound ring and RakNet
 * writes each one it sends into the outbound ring, with a one-byte UDP datagram on the loopback
 * interface to wake the other side, only when that side was idle. A burst costs one wake.
 *
 * `@jsprismarine/native-network`'s shared port is the owner the server uses; this package knows
 * only the ring layout.
 */
export class RingDatagramSource implements DatagramSource {
    private readonly inbound: SharedByteRing;
    private readonly outbound: SharedByteRing;
    private readonly header = Buffer.alloc(RING_DATAGRAM_HEADER_BYTES);
    private wakeSocket: Dgram.Socket | undefined;
    private outboundWakePort = 0;
    private listener: DatagramListener | undefined;

    /** Wakes received for inbound batches. */
    public wakes = 0;
    /** Datagrams delivered to RakNet. */
    public received = 0;
    /** Datagrams written to the outbound ring. */
    public sent = 0;
    /** Datagrams dropped because the outbound ring was full. */
    public dropped = 0;

    /**
     * @param rings - The rings' shared memory.
     * @param family - The address family of the datagrams this source carries.
     * @param sharedPort - The port the owner serves, which clients reach.
     * @param attach - Hands the rings to the owner; see {@link AttachRings}.
     */
    public constructor(
        rings: DatagramRings,
        private readonly family: 4 | 6,
        private readonly sharedPort: number,
        private readonly attach: AttachRings
    ) {
        this.inbound = new SharedByteRing(capacityOf(rings.inbound), rings.inbound);
        this.outbound = new SharedByteRing(capacityOf(rings.outbound), rings.outbound);
    }

    /**
     * Binds the wake socket and attaches the rings; the address and port are the owner's.
     * @returns The shared port.
     */
    public async start(_address: string, _port: number, listener: DatagramListener): Promise<number> {
        this.listener = listener;
        const socket = Dgram.createSocket('udp4').unref();
        this.wakeSocket = socket;
        socket.on('message', () => {
            this.wakes++;
            this.drain();
        });
        await new Promise<void>((resolve, reject) => {
            socket.once('error', reject);
            socket.bind(0, '127.0.0.1', () => {
                socket.off('error', reject);
                resolve();
            });
        });
        this.outboundWakePort = await this.attach(socket.address().port);
        // Datagrams written before the wake socket was known are waiting.
        this.drain();
        // And what RakNet wrote before the owner was known.
        if (this.outbound.getMetrics().queuedBytes > 0 && this.outbound.claimWake()) this.wakeOwner();
        return this.sharedPort;
    }

    /** Writes the datagram to the outbound ring, and wakes the owner if it was idle. */
    public send(buffers: Buffer | readonly Buffer[], port: number, address: string): void {
        if (this.wakeSocket === undefined) return;
        this.header.fill(0);
        this.header[0] = this.family;
        this.header.writeUInt16LE(port, 2);
        writeAddress(this.header, address, this.family);
        const parts = Buffer.isBuffer(buffers) ? [this.header, buffers] : [this.header, ...buffers];
        if (!this.outbound.tryWriteParts(parts)) {
            this.dropped++;
            return;
        }
        this.sent++;
        if (this.outboundWakePort !== 0 && this.outbound.claimWake()) this.wakeOwner();
    }

    /** Closes the wake socket; the rings belong to whoever allocated them. */
    public close(): void {
        const socket = this.wakeSocket;
        this.wakeSocket = undefined;
        this.listener = undefined;
        socket?.close();
    }

    private wakeOwner(): void {
        this.wakeSocket?.send(Buffer.from([1]), this.outboundWakePort, '127.0.0.1');
    }

    /** Delivers every datagram in the inbound ring; cleared first, so a write after it wakes again. */
    private drain(): void {
        this.inbound.clearWake();
        for (let record = this.inbound.tryRead(); record !== null; record = this.inbound.tryRead()) {
            const listener = this.listener;
            if (listener === undefined || record.byteLength < RING_DATAGRAM_HEADER_BYTES) continue;
            const family = record[0] === 6 ? 6 : 4;
            const datagram = record.subarray(RING_DATAGRAM_HEADER_BYTES);
            const from: RemoteInfo = {
                address: readAddress(record, family),
                port: record.readUInt16LE(2),
                family: family === 4 ? 'IPv4' : 'IPv6',
                size: datagram.byteLength
            };
            this.received++;
            listener(datagram, from);
        }
    }
}
