import { describe, expect, it } from 'vitest';
import UpdateBlockPacket, { UpdateBlockFlagsType, UpdateBlockLayerType } from './UpdateBlockPacket';

// Header: id 21 is 0x15. Position -1, 70, 2 zigzags to 1 (0x01), 140 (0x8c 0x01) and 4 (0x04).
// Runtime id 300 is 0xac 0x02, flags Neighbors|Network is 0x03, layer Liquid is 0x01.
const BYTES = Buffer.from([0x15, 0x01, 0x8c, 0x01, 0x04, 0xac, 0x02, 0x03, 0x01]);

describe('UpdateBlockPacket', () => {
    it('decodes a signed block position, runtime id, flags and layer, consuming the whole buffer', () => {
        const packet = new UpdateBlockPacket(BYTES);
        packet.decode();

        expect(packet.x).toBe(-1);
        expect(packet.y).toBe(70);
        expect(packet.z).toBe(2);
        expect(packet.blockRuntimeId).toBe(300);
        expect(packet.flags).toBe(UpdateBlockFlagsType.Neighbors | UpdateBlockFlagsType.Network);
        expect(packet.layer).toBe(UpdateBlockLayerType.Liquid);
        expect(packet.feof()).toBe(true);
    });

    it('encodes the same bytes', () => {
        const packet = new UpdateBlockPacket();
        packet.x = -1;
        packet.y = 70;
        packet.z = 2;
        packet.blockRuntimeId = 300;
        packet.flags = UpdateBlockFlagsType.Neighbors | UpdateBlockFlagsType.Network;
        packet.layer = UpdateBlockLayerType.Liquid;
        packet.encode();

        expect(packet.getBuffer()).toEqual(BYTES);
    });
});
