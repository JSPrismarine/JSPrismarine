import dgram from 'node:dgram';
import { once } from 'node:events';
import { describe, expect, it, vi } from 'vitest';

import { ACK, UnconnectedPing } from '@jsprismarine/raknet';
import SharedByteRing from '@jsprismarine/raknet/SharedByteRing';

import { DATAGRAM_HEADER_BYTES, RING_CONTROL_BYTES, SharedPort } from './SharedPort';
import { loadNative, nativeLibraryAvailable } from './testing/native.test.helper';
import { runLoopback } from './testing/loopback';

const RING_CAPACITY = 1 << 16;

/** A pair of rings in SharedByteRing's layout. */
const newRings = () => ({
    inbound: new SharedArrayBuffer(SharedByteRing.byteLength(RING_CAPACITY)),
    outbound: new SharedArrayBuffer(SharedByteRing.byteLength(RING_CAPACITY))
});

/** A UDP port nothing holds right now. */
const freePort = async (): Promise<number> => {
    const socket = dgram.createSocket('udp6');
    socket.bind(0, '::');
    await once(socket, 'listening');
    const { port } = socket.address();
    socket.close();
    return port;
};

/** A loopback socket that counts the wakes it receives. */
const wakeListener = async () => {
    const socket = dgram.createSocket('udp4');
    let wakes = 0;
    socket.on('message', () => wakes++);
    socket.bind(0, '127.0.0.1');
    await once(socket, 'listening');
    return {
        port: socket.address().port,
        wakes: () => wakes,
        close: () => socket.close()
    };
};

const ping = (timestamp: bigint): Buffer => {
    const packet = new UnconnectedPing();
    packet.timestamp = timestamp;
    packet.clientGUID = 42n;
    packet.encode();
    return packet.getBuffer();
};

const ack = (sequence: number): Buffer => {
    const packet = new ACK();
    packet.sequenceNumbers = [sequence];
    packet.encode();
    return packet.getBuffer();
};

/** Every record in a ring, as its source port and payload. */
const drain = (ring: SharedByteRing): { family: number; port: number; payload: Buffer }[] => {
    const records = [];
    for (let record = ring.tryRead(); record !== null; record = ring.tryRead()) {
        records.push({
            family: record[0]!,
            port: record.readUInt16LE(2),
            payload: record.subarray(DATAGRAM_HEADER_BYTES)
        });
    }
    return records;
};

describe.skipIf(!nativeLibraryAvailable())('a UDP port RakNet shares with NetherNet', async () => {
    const network = await loadNative();

    it('lays out its rings as SharedByteRing does', () => {
        expect(SharedByteRing.byteLength(RING_CAPACITY)).toBe(RING_CONTROL_BYTES + RING_CAPACITY);
    });

    it('hands a burst of RakNet datagrams to the ring with one wake and no address lookups', async () => {
        const port = await freePort();
        const shared = SharedPort.open(network, port);
        const wake = await wakeListener();
        const client = dgram.createSocket('udp4');
        try {
            const rings = newRings();
            shared.attach(4, rings, wake.port);
            const inbound = new SharedByteRing(RING_CAPACITY, rings.inbound);
            client.bind(0, '127.0.0.1');
            await once(client, 'listening');

            const burst = [...Array.from({ length: 10 }, (_, index) => ping(BigInt(index))), ...[1, 2, 3].map(ack)];
            for (const datagram of burst) client.send(datagram, port, '127.0.0.1');
            await vi.waitFor(() => expect(shared.stats().raknet).toBe(burst.length));

            const records = drain(inbound);
            expect(records.map((record) => record.payload)).toStrictEqual(burst);
            expect(new Set(records.map((record) => `${record.family}:${record.port}`))).toStrictEqual(
                new Set([`4:${client.address().port}`])
            );
            await vi.waitFor(() => expect(wake.wakes()).toBe(1));
            expect(shared.stats()).toMatchObject({ raknet: 13, passed: 0, wakes: 1, ringFull: 0 });

            // Cleared by the consumer, the next datagram wakes it again.
            inbound.clearWake();
            client.send(ack(4), port, '127.0.0.1');
            await vi.waitFor(() => expect(wake.wakes()).toBe(2));
        } finally {
            client.close();
            wake.close();
            shared.close();
        }
    });

    it('sends what RakNet writes to the outbound ring from the shared port', async () => {
        const port = await freePort();
        const shared = SharedPort.open(network, port);
        const wake = await wakeListener();
        const client = dgram.createSocket('udp4');
        try {
            const rings = newRings();
            const outboundWakePort = shared.attach(4, rings, wake.port);
            const outbound = new SharedByteRing(RING_CAPACITY, rings.outbound);
            client.bind(0, '127.0.0.1');
            await once(client, 'listening');
            const received: { from: number; message: Buffer }[] = [];
            client.on('message', (message, info) => received.push({ from: info.port, message }));

            const header = Buffer.alloc(DATAGRAM_HEADER_BYTES);
            header[0] = 4;
            header.writeUInt16LE(client.address().port, 2);
            Buffer.from([127, 0, 0, 1]).copy(header, 4);
            const replies = [Buffer.from('first'), Buffer.from('second'), Buffer.from('third')];
            for (const reply of replies) expect(outbound.tryWriteParts([header, reply])).toBe(true);
            // One wake for the batch.
            expect(outbound.claimWake()).toBe(true);
            const waker = dgram.createSocket('udp4');
            waker.send(Buffer.from([1]), outboundWakePort, '127.0.0.1', () => waker.close());

            await vi.waitFor(() => expect(received).toHaveLength(3));
            expect(received.map((entry) => entry.message)).toStrictEqual(replies);
            expect(received.every((entry) => entry.from === port)).toBe(true);
            expect(shared.stats()).toMatchObject({ sent: 3, sendFailed: 0 });
        } finally {
            client.close();
            wake.close();
            shared.close();
        }
    });

    it('serves a peer connection on the same port while RakNet datagrams reach only the ring', async () => {
        const port = await freePort();
        const shared = SharedPort.open(network, port);
        const wake = await wakeListener();
        const client = dgram.createSocket('udp4');
        try {
            const rings = newRings();
            shared.attach(4, rings, wake.port);
            const inbound = new SharedByteRing(RING_CAPACITY, rings.inbound);
            client.bind(0, '127.0.0.1');
            await once(client, 'listening');

            const exchange = runLoopback(
                network,
                { enableIceUdpMux: true, portRangeBegin: port, portRangeEnd: port },
                200,
                1000
            );
            const pings = Array.from({ length: 20 }, (_, index) => ping(BigInt(index)));
            for (const datagram of pings) client.send(datagram, port, '127.0.0.1');
            const result = await exchange;

            expect(result.bytesReceived).toBe(result.bytesSent);
            expect(result.bytesSent).toBe(200_000);
            // The selected local candidate is on the shared port, whatever its type.
            expect(/ (\d+) typ /.exec(result.answererPair?.local ?? '')?.[1]).toBe(String(port));
            await vi.waitFor(() => expect(shared.stats().raknet).toBe(pings.length));
            expect(drain(inbound).map((record) => record.payload)).toStrictEqual(pings);
            const stats = shared.stats();
            // Every WebRTC datagram went to libjuice's lookup, and none of them to RakNet.
            expect(stats.passed).toBeGreaterThan(0);
            expect(stats.unhandledToRakNet).toBe(0);
        } finally {
            client.close();
            wake.close();
            shared.close();
        }
    });

    it('refuses a port another socket holds', async () => {
        const holder = dgram.createSocket('udp4');
        holder.bind(0, '0.0.0.0');
        await once(holder, 'listening');
        try {
            expect(() => SharedPort.open(network, holder.address().port)).toThrow(
                `UDP port ${holder.address().port} cannot be bound`
            );
        } finally {
            holder.close();
        }
    });
});
