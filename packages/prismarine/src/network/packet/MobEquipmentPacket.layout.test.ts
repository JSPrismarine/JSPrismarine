import BinaryStream from '@jsprismarine/binaryutils';
import { layoutAt, mobEquipmentPacket } from '@jsprismarine/protocol';
import { describe, expect, it } from 'vitest';

import { Item } from '../../item/Item';
import MobEquipmentPacket from './MobEquipmentPacket';

/**
 * The layout must write the bytes the hand-written encoder wrote. The stack travels as the
 * six descriptor fields, which is what `Item` already converts itself to and from, so the
 * round trip is asserted on the descriptor rather than on two `Item` instances.
 */
describe('the declarative MobEquipment layout', () => {
    const fill = (): MobEquipmentPacket => {
        const packet = new MobEquipmentPacket();
        packet.runtimeEntityId = 4n;
        packet.item = new Item({ name: 'minecraft:stone', count: 17 });
        packet.inventorySlot = 5;
        packet.hotbarSlot = 5;
        packet.windowId = 0;
        return packet;
    };

    it('matches the bytes the class wrote', () => {
        const packet = fill();

        const expected = new BinaryStream();
        expected.writeUnsignedVarLong(packet.runtimeEntityId);
        packet.item.networkSerialize(expected);
        expected.writeByte(packet.inventorySlot);
        expected.writeByte(packet.hotbarSlot);
        expected.writeByte(packet.windowId);

        const stream = new BinaryStream();
        layoutAt(mobEquipmentPacket, 2193).encode(stream, {
            runtimeEntityId: packet.runtimeEntityId,
            item: packet.item.toStackDescriptor(stream),
            inventorySlot: packet.inventorySlot,
            hotbarSlot: packet.hotbarSlot,
            windowId: packet.windowId
        });

        expect(stream.getBuffer()).toEqual(expected.getBuffer());
    });

    it('round-trips through the packet class and consumes the payload', () => {
        const sent = fill();
        sent.encodePayload();

        const received = new MobEquipmentPacket(sent.getBuffer());
        received.decodePayload();

        expect(received.runtimeEntityId).toBe(sent.runtimeEntityId);
        expect(received.item.toStackDescriptor(received)).toEqual(sent.item.toStackDescriptor(sent));
        expect(received.inventorySlot).toBe(sent.inventorySlot);
        expect(received.hotbarSlot).toBe(sent.hotbarSlot);
        expect(received.windowId).toBe(sent.windowId);
        expect(received.feof()).toBe(true);
    });
});
