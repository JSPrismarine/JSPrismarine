import { describe, expect, it } from 'vitest';
import SubChunkRequestPacket from './SubChunkRequestPacket';

describe('SubChunkRequestPacket', () => {
    // Header: id 175 as LEB128 is 0xaf 0x01.
    it('decodes the dimension, int8 offsets, and int32 LE center, consuming the whole buffer', () => {
        // Dimension 1 zigzags to 2. Two offsets: (0, -1, 0) and (1, 2, -3). Center 5, -2, 7.
        const packet = new SubChunkRequestPacket(
            Buffer.from([
                0xaf, 0x01, 0x02, 0x02, 0x00, 0xff, 0x00, 0x01, 0x02, 0xfd, 0x05, 0x00, 0x00, 0x00, 0xfe, 0xff, 0xff,
                0xff, 0x07, 0x00, 0x00, 0x00
            ])
        );
        packet.decode();

        expect(packet.dimensionType).toBe(1);
        expect(packet.offsets).toEqual([
            { x: 0, y: -1, z: 0 },
            { x: 1, y: 2, z: -3 }
        ]);
        expect(packet.centerPos).toEqual({ x: 5, y: -2, z: 7 });
        expect(packet.feof()).toBe(true);
    });

    it('encodes the same bytes', () => {
        const packet = new SubChunkRequestPacket();
        packet.dimensionType = 1;
        packet.offsets = [{ x: 0, y: -1, z: 0 }];
        packet.centerPos = { x: 5, y: -2, z: 7 };
        packet.encode();

        expect(packet.getBuffer()).toEqual(
            Buffer.from([
                0xaf, 0x01, 0x02, 0x01, 0x00, 0xff, 0x00, 0x05, 0, 0, 0, 0xfe, 0xff, 0xff, 0xff, 0x07, 0, 0, 0
            ])
        );
    });

    it('writes and reads the same bytes at protocols 2193 and 2225, which changed nothing in this packet', () => {
        const encodeAt = (protocol: number): Buffer => {
            const packet = new SubChunkRequestPacket();
            packet.codecProtocol = protocol;
            packet.dimensionType = 2;
            packet.offsets = [{ x: -128, y: 127, z: 0 }];
            packet.centerPos = { x: -1, y: 4, z: 70000 };
            packet.encode();
            return packet.getBuffer();
        };
        const at2193 = encodeAt(2193);
        expect(encodeAt(2225)).toEqual(at2193);

        const decoded = new SubChunkRequestPacket(at2193);
        decoded.codecProtocol = 2225;
        decoded.decode();
        expect(decoded.dimensionType).toBe(2);
        expect(decoded.offsets).toEqual([{ x: -128, y: 127, z: 0 }]);
        expect(decoded.centerPos).toEqual({ x: -1, y: 4, z: 70000 });
        expect(decoded.feof()).toBe(true);
    });
});
