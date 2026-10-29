import BinaryStream from '@jsprismarine/binaryutils';
import { describe, expect, it } from 'vitest';

import { Item } from '../../item/Item';
import Identifiers from '../Identifiers';
import MobArmorEquipmentPacket from './MobArmorEquipmentPacket';

const air = (): Item => new Item({ runtimeId: 0, name: 'minecraft:air' });

/**
 * A stack whose name is not in the item table, so the runtime id given here is the one that goes out.
 * A vanilla name would be replaced by the table's number, which the test would then have to
 * look up to write the bytes.
 */
const stack = (runtimeId: number, count = 1): Item => new Item({ runtimeId, name: 'test:armor', count });

/**
 * One `NetworkItemStackDescriptor` as the server writes a plain, un-enchanted stack: `Id`
 * (int16 little endian), `Stack size` (uint16 little endian), `Aux value` (varuint), no
 * `Net Id Variant` (one false byte), `Block Runtime Id` (varuint) and the `User Data Buffer`
 * behind a varuint length: no NBT marker (int16), an empty can-place-on list and an empty
 * can-destroy list (uint32 counts).
 */
const stackBytes = (id: number, count: number): number[] => [
    id & 0xff,
    id >> 8,
    count & 0xff,
    count >> 8,
    0x00,
    0x00,
    0x00,
    0x0a,
    ...[0x00, 0x00],
    ...[0x00, 0x00, 0x00, 0x00],
    ...[0x00, 0x00, 0x00, 0x00]
];

/** The empty stack: eight zero bytes, one for every field, and no user data. */
const AIR_BYTES = [0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00];

describe('MobArmorEquipmentPacket', () => {
    it('writes the runtime id and then five stacks in head, torso, legs, feet, body order', () => {
        const chestplate = new Item({ runtimeId: 0, name: 'minecraft:diamond_chestplate' });
        const planks = new Item({ runtimeId: 0, name: 'minecraft:oak_planks', count: 3 });

        const packet = new MobArmorEquipmentPacket();
        packet.runtimeEntityId = 1234n;
        packet.head = air();
        packet.chest = chestplate;
        packet.legs = air();
        packet.feet = air();
        packet.body = planks;
        packet.encode();

        const stream = new BinaryStream(packet.getBuffer());
        expect(stream.readUnsignedVarInt()).toBe(MobArmorEquipmentPacket.NetID);
        expect(stream.readUnsignedVarLong()).toBe(1234n);

        // The item id is a wire detail (air is serialized as zero), but the decoded slots still
        // need to identify each item in the packet's documented order.
        const slots = Array.from({ length: 5 }, () => Item.networkDeserialize(stream));
        expect(slots.map((item) => item.getName())).toStrictEqual([
            'minecraft:air',
            chestplate.getName(),
            'minecraft:air',
            'minecraft:air',
            planks.getName()
        ]);
        expect(slots[0]?.getName()).toBe('minecraft:air');
        expect(slots[1]?.count).toBe(1);
        expect(slots[4]?.count).toBe(3);
        expect(stream.feof()).toBe(true);
    });

    it('matches the 2193 layout byte for byte', () => {
        const packet = new MobArmorEquipmentPacket();
        packet.runtimeEntityId = 300n;
        packet.head = stack(0x0141);
        packet.chest = air();
        packet.legs = air();
        packet.feet = stack(0x0200, 2);
        packet.body = air();
        packet.encode();

        expect([...packet.getBuffer()]).toStrictEqual([
            Identifiers.MobArmorEquipmentPacket,
            ...[0xac, 0x02], // Target Runtime ID, varuint64 300.
            ...stackBytes(0x0141, 1), // Head.
            ...AIR_BYTES, // Torso.
            ...AIR_BYTES, // Legs.
            ...stackBytes(0x0200, 2), // Feet.
            ...AIR_BYTES // Body.
        ]);
    });

    it('reads the five slots back and consumes the whole buffer', () => {
        const packet = new MobArmorEquipmentPacket(
            Buffer.from([
                Identifiers.MobArmorEquipmentPacket,
                0x07,
                ...AIR_BYTES,
                ...stackBytes(0x0141, 1),
                ...AIR_BYTES,
                ...AIR_BYTES,
                ...stackBytes(0x0200, 2)
            ])
        );
        packet.decode();

        expect(packet.runtimeEntityId).toBe(7n);
        expect(packet.head.getName()).toBe('minecraft:air');
        expect(packet.chest.getRuntimeId()).toBe(0x0141);
        expect(packet.chest.count).toBe(1);
        expect(packet.legs.getName()).toBe('minecraft:air');
        expect(packet.feet.getName()).toBe('minecraft:air');
        expect(packet.body.getRuntimeId()).toBe(0x0200);
        expect(packet.body.count).toBe(2);
        expect(packet.feof()).toBe(true);
    });
});
