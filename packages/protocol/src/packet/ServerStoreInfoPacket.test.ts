import { describe, expect, it } from 'vitest';

import NetworkBinaryStream from '../NetworkBinaryStream';
import ClientStoreEntryPointConfig from '../structure/ClientStoreEntryPointConfig';
import ServerStoreInfoPacket from './ServerStoreInfoPacket';

import type { ServerStoreInfo } from './ServerStoreInfoPacket';

const DATA: ServerStoreInfo = {
    clientStoreEntryPointConfiguration: new ClientStoreEntryPointConfig('store-1', 'Example Store')
};

const ABSENT: ServerStoreInfo = { clientStoreEntryPointConfiguration: null };

/** `DATA` on the wire, header bytes included, written by hand in the order the docs list the fields. */
const BYTES = Buffer.from([
    ...[0xda, 0x02], // packet id header: 346 as a varuint32
    0x01, // presence bool of the optional configuration
    ...[0x07, ...Buffer.from('store-1', 'utf8')], // storeId
    ...[0x0d, ...Buffer.from('Example Store', 'utf8')] // storeName, 13 bytes
]);

/** The packet with no configuration: the header and a false presence bool. */
const ABSENT_BYTES = Buffer.from([0xda, 0x02, 0x00]);

/** The two protocols that carry the packet. The presence byte is on the wire at both. */
const PROTOCOLS = [2193, 2225] as const;

function packetAt(protocol: number, data?: ServerStoreInfo): ServerStoreInfoPacket {
    const packet = new ServerStoreInfoPacket(data);
    packet.codecProtocol = protocol;
    return packet;
}

describe('ServerStoreInfoPacket', () => {
    describe.each(PROTOCOLS)('at protocol %s', (protocol) => {
        it('writes a presence byte, then every field in the order the docs list', () => {
            const buffer = packetAt(protocol, DATA).serialize(new NetworkBinaryStream());

            expect([...buffer]).toEqual([...BYTES]);
        });

        it('writes only a false presence byte for an absent configuration', () => {
            const buffer = packetAt(protocol, ABSENT).serialize(new NetworkBinaryStream());

            expect([...buffer]).toEqual([...ABSENT_BYTES]);
        });

        it('reads a hand-built buffer to its end', () => {
            const stream = new NetworkBinaryStream(BYTES);
            const data = packetAt(protocol).deserialize(stream);

            expect(data).toEqual(DATA);
            expect(stream.feof()).toBe(true);
        });

        it('reads an absent configuration to its end', () => {
            const stream = new NetworkBinaryStream(ABSENT_BYTES);
            const data = packetAt(protocol).deserialize(stream);

            expect(data).toEqual(ABSENT);
            expect(stream.feof()).toBe(true);
        });

        it.each([DATA, ABSENT])('round-trips a packet', (payload) => {
            const buffer = packetAt(protocol, payload).serialize(new NetworkBinaryStream());
            const data = packetAt(protocol).deserialize(new NetworkBinaryStream(buffer));

            expect(data).toEqual(payload);
        });
    });
});
