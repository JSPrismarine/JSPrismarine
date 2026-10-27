import { WindowIds } from '@jsprismarine/minecraft';
import { describe, expect, it } from 'vitest';

import { Item } from '../../item/Item';
import Identifiers from '../Identifiers';
import MobEquipmentPacket from './MobEquipmentPacket';

/** The empty stack: eight zero bytes, one for every descriptor field, and no user data. */
const AIR_BYTES = [0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00];

/**
 * A single stack of id `0x0141` as the server writes it: `Id` (int16 little endian),
 * `Stack size` (uint16 little endian), `Aux value` (varuint), no `Net Id Variant` (one false
 * byte), `Block Runtime Id` (varuint) and a ten byte `User Data Buffer` behind its varuint
 * length: no NBT marker (int16), then empty can-place-on and can-destroy lists (uint32 counts).
 */
const SWORD_BYTES = [
    0x41,
    0x01,
    0x01,
    0x00,
    0x00,
    0x00,
    0x00,
    0x0a,
    ...[0x00, 0x00],
    ...[0x00, 0x00, 0x00, 0x00],
    ...[0x00, 0x00, 0x00, 0x00]
];

/** The 2193 layout written out by hand, so a shifted field fails the comparison. */
const bytes = (runtimeId: number[], item: number[], slots: number[]): Buffer =>
    Buffer.from([Identifiers.MobEquipmentPacket, ...runtimeId, ...item, ...slots]);

describe('network', () => {
    describe('packet', () => {
        describe('MobEquipmentPacket', () => {
            it('writes target, item, then the three one byte slot fields', () => {
                const packet = new MobEquipmentPacket();
                packet.runtimeEntityId = 300n;
                // A name the item table does not know, so the id given here is the one written.
                packet.item = new Item({ runtimeId: 0x0141, name: 'test:sword' });
                packet.inventorySlot = 4;
                packet.hotbarSlot = 4;
                packet.windowId = WindowIds.INVENTORY;
                packet.encode();

                expect([...packet.getBuffer()]).toStrictEqual([
                    ...bytes([0xac, 0x02], SWORD_BYTES, [0x04, 0x04, 0x00])
                ]);
            });

            it('writes an empty hand as a full air descriptor, not a bare zero', () => {
                const packet = new MobEquipmentPacket();
                packet.runtimeEntityId = 1n;
                packet.item = Item.air();
                packet.inventorySlot = 0;
                packet.hotbarSlot = 0;
                packet.windowId = WindowIds.OFFHAND;
                packet.encode();

                expect([...packet.getBuffer()]).toStrictEqual([...bytes([0x01], AIR_BYTES, [0x00, 0x00, 0x77])]);
            });

            it('reads every field and consumes the whole buffer', () => {
                const packet = new MobEquipmentPacket(bytes([0xac, 0x02], AIR_BYTES, [0x08, 0x08, 0x00]));
                packet.decode();

                expect(packet.runtimeEntityId).toBe(300n);
                expect(packet.item.getName()).toBe('minecraft:air');
                expect(packet.inventorySlot).toBe(8);
                expect(packet.hotbarSlot).toBe(8);
                expect(packet.windowId).toBe(WindowIds.INVENTORY);
                expect(packet.feof()).toBe(true);
            });

            it('reads a held stack by the id it was sent under', () => {
                const packet = new MobEquipmentPacket(bytes([0x07], SWORD_BYTES, [0x02, 0x02, 0x00]));
                packet.decode();

                expect(packet.runtimeEntityId).toBe(7n);
                expect(packet.item.getNetworkId()).toBe(0x0141);
                expect(packet.item.count).toBe(1);
                expect(packet.inventorySlot).toBe(2);
                expect(packet.hotbarSlot).toBe(2);
                expect(packet.feof()).toBe(true);
            });
        });
    });
});
