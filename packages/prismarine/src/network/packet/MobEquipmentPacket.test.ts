import BinaryStream from '@jsprismarine/binaryutils';
import { describe, expect, it } from 'vitest';

import { Item } from '../../item/Item';
import Identifiers from '../Identifiers';
import MobEquipmentPacket from './MobEquipmentPacket';

/** The 2193 layout written out by hand, so a shifted field fails the comparison. */
const expectedBytes = (runtimeId: number[], slots: number[]): Buffer => {
    const item = new BinaryStream();
    Item.air().networkSerialize(item);

    return Buffer.concat([
        Buffer.from([Identifiers.MobEquipmentPacket]),
        Buffer.from(runtimeId),
        item.getBuffer(),
        Buffer.from(slots)
    ]);
};

describe('network', () => {
    describe('packet', () => {
        describe('MobEquipmentPacket', () => {
            it('writes target, item, then the three one byte slot fields', () => {
                const packet = new MobEquipmentPacket();
                packet.runtimeEntityId = 300n;
                packet.item = Item.air();
                packet.inventorySlot = 4;
                packet.hotbarSlot = 4;
                packet.windowId = 0;
                packet.encode();

                expect([...packet.getBuffer()]).toEqual([...expectedBytes([0xac, 0x02], [0x04, 0x04, 0x00])]);
            });

            it('writes an empty hand as a full air descriptor, not a bare zero', () => {
                const packet = new MobEquipmentPacket();
                packet.runtimeEntityId = 1n;
                packet.item = Item.air();
                packet.inventorySlot = 0;
                packet.hotbarSlot = 0;
                packet.windowId = 119; // The offhand container.
                packet.encode();

                // Header, runtime id, eight bytes of air descriptor, three slot bytes.
                expect(packet.getBuffer().byteLength).toBe(1 + 1 + 8 + 3);
                expect([...packet.getBuffer().subarray(2, 10)]).toEqual([0, 0, 0, 0, 0, 0, 0, 0]);
                expect(packet.getBuffer().at(-1)).toBe(119);
            });

            it('reads every field and consumes the whole buffer', () => {
                const packet = new MobEquipmentPacket(expectedBytes([0xac, 0x02], [0x08, 0x08, 0x00]));
                packet.decode();

                expect(packet.runtimeEntityId).toBe(300n);
                expect(packet.item.getName()).toBe('minecraft:air');
                expect(packet.inventorySlot).toBe(8);
                expect(packet.hotbarSlot).toBe(8);
                expect(packet.windowId).toBe(0);
                expect(packet.feof()).toBe(true);
            });
        });
    });
});
