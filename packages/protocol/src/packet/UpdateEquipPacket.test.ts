import { describe, expect, it } from 'vitest';
import UpdateEquipPacket from './UpdateEquipPacket';

describe('UpdateEquipPacket', () => {
    // An empty network NBT compound: TAG_Compound, an empty name, TAG_End.
    const inventory = Buffer.from([0x0a, 0x00, 0x00]);

    // One Buffer per docs field, in wire order.
    const encoded = Buffer.concat([
        Buffer.from([0x51]), // Header, packet 81
        Buffer.from([0x01]), // Container Id
        Buffer.from([0x0c]), // Type: the horse window
        Buffer.from([0x04]), // Size: varint32 2 zigzags to 4
        Buffer.from([0x12]), // Entity Unique Id: varint64 9 zigzags to 18
        inventory // Data
    ]);

    it('decodes every field and consumes the whole buffer', () => {
        const packet = new UpdateEquipPacket(encoded);
        packet.decode();

        expect(packet.containerId).toBe(1);
        expect(packet.type).toBe(12);
        expect(packet.size).toBe(2);
        expect(packet.entityUniqueId).toBe(9n);
        expect(packet.data).toEqual(inventory);
        expect(packet.feof()).toBe(true);
    });

    it('encodes the same bytes back', () => {
        const packet = new UpdateEquipPacket();
        packet.containerId = 1;
        packet.type = 12;
        packet.size = 2;
        packet.entityUniqueId = 9n;
        packet.data = inventory;
        packet.encode();

        expect(packet.getBuffer()).toEqual(encoded);
    });
});
