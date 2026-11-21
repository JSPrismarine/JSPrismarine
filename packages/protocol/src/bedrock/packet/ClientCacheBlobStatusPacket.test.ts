import { describe, expect, it } from 'vitest';
import ClientCacheBlobStatusPacket from './ClientCacheBlobStatusPacket';

describe('ClientCacheBlobStatusPacket', () => {
    // Header: id 135 as LEB128 is 0x87 0x01.
    it('decodes both lists as varuint counts of uint64 LE and consumes the whole buffer', () => {
        const packet = new ClientCacheBlobStatusPacket(
            Buffer.from([
                0x87,
                0x01,
                0x02, // two missing
                0x01,
                0,
                0,
                0,
                0,
                0,
                0,
                0,
                0xff,
                0xff,
                0xff,
                0xff,
                0xff,
                0xff,
                0xff,
                0xff,
                0x01, // one found
                0x02,
                0x01,
                0,
                0,
                0,
                0,
                0,
                0
            ])
        );
        packet.decode();

        expect(packet.missingIds).toEqual([1n, 0xffffffffffffffffn]);
        expect(packet.foundIds).toEqual([0x0102n]);
        expect(packet.feof()).toBe(true);
    });

    it('encodes empty lists as two zero counts', () => {
        const packet = new ClientCacheBlobStatusPacket();
        packet.encode();

        expect(packet.getBuffer()).toEqual(Buffer.from([0x87, 0x01, 0x00, 0x00]));
    });
});

describe('ClientCacheBlobStatusPacket at each protocol version', () => {
    const bytes = Buffer.from([
        0x87, 0x01, 0x02, 0x01, 0, 0, 0, 0, 0, 0, 0, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0x01, 0x02, 0x01,
        0, 0, 0, 0, 0, 0
    ]);

    it.each([2193, 2225])('round-trips the same bytes at protocol %i', (protocolVersion) => {
        const packet = new ClientCacheBlobStatusPacket(bytes);
        packet.codecProtocol = protocolVersion;
        packet.decode();
        expect(packet.missingIds).toEqual([1n, 0xffffffffffffffffn]);
        expect(packet.foundIds).toEqual([0x0102n]);

        const out = new ClientCacheBlobStatusPacket();
        out.codecProtocol = protocolVersion;
        out.missingIds = packet.missingIds;
        out.foundIds = packet.foundIds;
        out.encode();
        expect(out.getBuffer()).toEqual(bytes);
    });
});
