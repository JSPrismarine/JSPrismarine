import { describe, expect, it } from 'vitest';
import UpdateBlockPacket, { UpdateBlockFlagsType, UpdateBlockLayerType } from './UpdateBlockPacket';

const ENCODED = Buffer.concat([
    Buffer.from([0x15]), // Header: id 21.
    Buffer.from([0x01, 0x8c, 0x01, 0x04]), // Block Position -1, 70, 2 as three ZigZag varint32.
    Buffer.from([0xac, 0x02]), // Block Runtime ID 300 as a varuint32.
    Buffer.from([0x03]), // Flags Neighbors | Network.
    Buffer.from([0x01]) // Layer Liquid.
]);

describe('UpdateBlockPacket', () => {
    it('decodes a signed block position, runtime id, flags and layer, consuming the whole buffer', () => {
        const packet = new UpdateBlockPacket(ENCODED);
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

        expect(packet.getBuffer()).toEqual(ENCODED);
    });

    it('writes a hashed runtime id as the unsigned 32 bit number it is', () => {
        // Runtime ids are FNV-1a hashes and half of them have the top bit set. Read back as a
        // signed int they are negative; on the wire they are a varuint32 of up to five bytes.
        const packet = new UpdateBlockPacket();
        packet.blockRuntimeId = 0xdead1234;
        packet.encode();

        expect(packet.getBuffer()).toEqual(
            Buffer.from([0x15, 0x00, 0x00, 0x00, 0xb4, 0xa4, 0xb4, 0xf5, 0x0d, 0x00, 0x00])
        );
    });

    it('defaults to no flags and the normal layer', () => {
        const packet = new UpdateBlockPacket();
        packet.blockRuntimeId = 1;
        packet.encode();

        expect(packet.getBuffer()).toEqual(Buffer.from([0x15, 0x00, 0x00, 0x00, 0x01, 0x00, 0x00]));
    });
});
