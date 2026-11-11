import dgram from 'node:dgram';
import type { RemoteInfo } from 'node:dgram';
import { once } from 'node:events';
import { describe, expect, it, vi } from 'vitest';

import { allocateDatagramRings, RING_DATAGRAM_HEADER_BYTES, RingDatagramSource } from './RingDatagramSource';
import SharedByteRing from './SharedByteRing';

const CAPACITY = 1 << 12;

/** A stand-in for the native owner of a shared port: it writes inbound and reads outbound. */
const owner = async () => {
    const rings = allocateDatagramRings(CAPACITY);
    const inbound = new SharedByteRing(CAPACITY, rings.inbound);
    const outbound = new SharedByteRing(CAPACITY, rings.outbound);
    const control = dgram.createSocket('udp4');
    let wakes = 0;
    control.on('message', () => wakes++);
    control.bind(0, '127.0.0.1');
    await once(control, 'listening');
    let wakePort = 0;
    const attach = (port: number) => {
        wakePort = port;
        return control.address().port;
    };
    /** Writes a datagram as the native side would, and wakes RakNet if it was idle. */
    const deliver = (family: 4 | 6, address: Buffer, port: number, payload: Buffer) => {
        const header = Buffer.alloc(RING_DATAGRAM_HEADER_BYTES);
        header[0] = family;
        header.writeUInt16LE(port, 2);
        address.copy(header, 4);
        inbound.tryWriteParts([header, payload]);
        if (inbound.claimWake()) control.send(Buffer.from([1]), wakePort, '127.0.0.1');
    };
    return { rings, outbound, attach, deliver, wakes: () => wakes, close: () => control.close() };
};

describe('RingDatagramSource', () => {
    it('delivers a burst with one wake, with each sender’s address and port', async () => {
        const fake = await owner();
        const source = new RingDatagramSource(fake.rings, 6, 19132, fake.attach);
        const received: [string, number, string][] = [];
        try {
            expect(
                await source.start('::', 19132, (datagram, from: RemoteInfo) =>
                    received.push([from.address, from.port, datagram.toString()])
                )
            ).toBe(19132);
            const loopback = Buffer.alloc(16);
            loopback[15] = 1;
            const documentation = Buffer.from('20010db8000000000000000000000001', 'hex');
            for (let index = 0; index < 5; index++)
                fake.deliver(6, index % 2 === 0 ? loopback : documentation, 4000 + index, Buffer.from(`d${index}`));

            await vi.waitFor(() => expect(received).toHaveLength(5));
            expect(received).toStrictEqual([
                ['::1', 4000, 'd0'],
                ['2001:db8::1', 4001, 'd1'],
                ['::1', 4002, 'd2'],
                ['2001:db8::1', 4003, 'd3'],
                ['::1', 4004, 'd4']
            ]);
            expect(source.wakes).toBe(1);
        } finally {
            source.close();
            fake.close();
        }
    });

    it('writes what RakNet sends to the outbound ring and wakes the owner once per batch', async () => {
        const fake = await owner();
        const source = new RingDatagramSource(fake.rings, 4, 19132, fake.attach);
        try {
            await source.start('0.0.0.0', 19132, () => {});
            for (let index = 0; index < 4; index++)
                source.send([Buffer.from('ab'), Buffer.from(`${index}`)], 5000 + index, '192.0.2.7');

            await vi.waitFor(() => expect(fake.wakes()).toBe(1));
            const records = [];
            for (let record = fake.outbound.tryRead(); record !== null; record = fake.outbound.tryRead())
                records.push(record);
            expect(
                records.map((record) => [
                    record[0],
                    record.readUInt16LE(2),
                    [...record.subarray(4, 8)].join('.'),
                    record.subarray(RING_DATAGRAM_HEADER_BYTES).toString()
                ])
            ).toStrictEqual([
                [4, 5000, '192.0.2.7', 'ab0'],
                [4, 5001, '192.0.2.7', 'ab1'],
                [4, 5002, '192.0.2.7', 'ab2'],
                [4, 5003, '192.0.2.7', 'ab3']
            ]);
            expect(source.sent).toBe(4);
        } finally {
            source.close();
            fake.close();
        }
    });
});
