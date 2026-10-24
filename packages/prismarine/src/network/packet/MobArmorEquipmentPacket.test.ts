import BinaryStream from '@jsprismarine/binaryutils';
import { describe, expect, it } from 'vitest';

import { Item } from '../../item/Item';
import MobArmorEquipmentPacket from './MobArmorEquipmentPacket';

const air = (): Item => new Item({ id: 0, name: 'minecraft:air' });

describe('MobArmorEquipmentPacket', () => {
    it('writes the runtime id and then five stacks in head, torso, legs, feet, body order', () => {
        const chestplate = new Item({ id: 0, name: 'minecraft:diamond_chestplate' });
        const planks = new Item({ id: 0, name: 'minecraft:oak_planks', count: 3 });

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

        // Decoding does not resolve a wire id back to a name, so a non-air slot is checked by
        // the id it went out under. Air comes back by name with a zero id.
        const slots = Array.from({ length: 5 }, () => Item.networkDeserialize(stream));
        expect(slots.map((item) => item.getId())).toStrictEqual([
            0,
            chestplate.getNetworkId(),
            0,
            0,
            planks.getNetworkId()
        ]);
        expect(slots[0]?.getName()).toBe('minecraft:air');
        expect(slots[1]?.count).toBe(1);
        expect(slots[4]?.count).toBe(3);
        expect(stream.feof()).toBe(true);
    });
});
