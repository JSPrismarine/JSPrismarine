import { describe, expect, it } from 'vitest';
import MapInfoRequestPacket from './MapInfoRequestPacket';

describe('MapInfoRequestPacket', () => {
    it('decodes the map id and a uint32 LE counted pixel list, consuming the whole buffer', () => {
        // Header 0x44. Map 1234 zigzags to 0xa4 0x13. Count 2 as uint32 LE. Two pixel and index pairs.
        const packet = new MapInfoRequestPacket(
            Buffer.from([
                0x44, 0xa4, 0x13, 0x02, 0x00, 0x00, 0x00, 0xff, 0x00, 0x00, 0xff, 0x05, 0x00, 0x00, 0xff, 0x00, 0xff,
                0xff, 0x7f
            ])
        );
        packet.decode();

        expect(packet.mapUniqueId).toBe(1234n);
        expect(packet.clientPixels).toEqual([
            { pixel: 0xff0000ff, index: 5 },
            { pixel: 0xff00ff00, index: 0x7fff }
        ]);
        expect(packet.feof()).toBe(true);
    });

    it('decodes an empty list as four zero bytes', () => {
        const packet = new MapInfoRequestPacket(Buffer.from([0x44, 0x02, 0x00, 0x00, 0x00, 0x00]));
        packet.decode();

        expect(packet.mapUniqueId).toBe(1n);
        expect(packet.clientPixels).toEqual([]);
        expect(packet.feof()).toBe(true);
    });

    it('encodes the same bytes', () => {
        const packet = new MapInfoRequestPacket();
        packet.mapUniqueId = 1n;
        packet.clientPixels = [{ pixel: 0xff0000ff, index: 5 }];
        packet.encode();

        expect(packet.getBuffer()).toEqual(
            Buffer.from([0x44, 0x02, 0x01, 0x00, 0x00, 0x00, 0xff, 0x00, 0x00, 0xff, 0x05, 0x00])
        );
    });
});
