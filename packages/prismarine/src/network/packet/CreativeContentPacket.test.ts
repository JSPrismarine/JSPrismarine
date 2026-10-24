import BinaryStream from '@jsprismarine/binaryutils';
import { describe, expect, it } from 'vitest';

import { Item } from '../../item/Item';
import CreativeContentPacket, { CreativeCategory, creativeCategoryOf } from './CreativeContentPacket';

/**
 * Writes a `NetworkItemInstanceDescriptor` by hand, in the order protocol 2193 lays it out:
 * Id, Stack size, Aux value, Block Runtime Id, User Data Buffer. Written here rather than
 * with `Item.networkSerializeWithoutStackId` so the test pins the bytes and not the writer.
 */
const writeItem = (out: BinaryStream, id: number, count: number, aux: number): void => {
    out.writeVarInt(id);
    out.writeUnsignedShortLE(count);
    out.writeUnsignedVarInt(aux);
    out.writeVarInt(0); // Block Runtime Id: none of the items below place a block.
    out.writeUnsignedVarInt(10); // User Data Buffer: no nbt, no can-place-on, no can-break.
    out.writeShortLE(0);
    out.writeIntLE(0);
    out.writeIntLE(0);
};

/** The empty stack: five zero fields, including a zero length User Data Buffer. */
const writeAir = (out: BinaryStream): void => {
    out.writeVarInt(0);
    out.writeUnsignedShortLE(0);
    out.writeUnsignedVarInt(0);
    out.writeVarInt(0);
    out.writeUnsignedVarInt(0);
};

const writeString = (out: BinaryStream, value: string): void => {
    const bytes = Buffer.from(value, 'utf8');
    out.writeUnsignedVarInt(bytes.byteLength);
    out.write(new Uint8Array(bytes));
};

const encode = (packet: CreativeContentPacket): Buffer => {
    packet.encode();
    return packet.getBuffer();
};

const decode = (buffer: Buffer): CreativeContentPacket => {
    const packet = new CreativeContentPacket(buffer);
    packet.decode();
    return packet;
};

describe('CreativeContentPacket', () => {
    it('writes every group and then every entry under the group it names', () => {
        // A sword rather than a plank: the helpers below write a zero Block Runtime Id, so an
        // item that places a block would pin the wrong bytes.
        const sword = new Item({ id: 308, name: 'minecraft:wooden_sword', count: 1 });
        const stick = new Item({ id: 280, name: 'minecraft:stick', count: 64 });
        const dyedStick = new Item({ id: 280, name: 'minecraft:stick', meta: 2, count: 1 });

        const packet = new CreativeContentPacket();
        packet.groups = [
            { category: CreativeCategory.EQUIPMENT, name: 'itemGroup.name.sword', icon: sword },
            { category: CreativeCategory.ITEMS, name: '', icon: Item.air() }
        ];
        packet.entries = [
            { item: stick, group: 1 },
            { item: dyedStick, group: 1 }
        ];

        const expected = new BinaryStream();
        expected.writeUnsignedVarInt(0x91); // Header.
        expected.writeUnsignedVarInt(2); // Groups.
        expected.writeByte(CreativeCategory.EQUIPMENT); // Creative Category.
        writeString(expected, 'itemGroup.name.sword'); // Name.
        writeItem(expected, sword.getNetworkId(), 1, 0); // Group Icon Item.
        expected.writeByte(CreativeCategory.ITEMS);
        expected.writeUnsignedVarInt(0); // Name: empty, so the group is anonymous.
        writeAir(expected);
        expected.writeUnsignedVarInt(2); // Entries.
        expected.writeUnsignedVarInt(1); // Creative Net Id, one-based.
        writeItem(expected, stick.getNetworkId(), 64, 0); // Item Instance.
        expected.writeUnsignedVarInt(1); // Group Index.
        expected.writeUnsignedVarInt(2);
        writeItem(expected, dyedStick.getNetworkId(), 1, 2);
        expected.writeUnsignedVarInt(1);

        expect(encode(packet)).toEqual(expected.getBuffer());
    });

    it('names a tab from the word the creative data uses for it', () => {
        expect(creativeCategoryOf('construction')).toBe(CreativeCategory.CONSTRUCTION);
        expect(creativeCategoryOf('nature')).toBe(CreativeCategory.NATURE);
        expect(creativeCategoryOf('equipment')).toBe(CreativeCategory.EQUIPMENT);
        expect(creativeCategoryOf('items')).toBe(CreativeCategory.ITEMS);

        // A tab this does not know still has to leave the menu drawable.
        expect(creativeCategoryOf('something_mojang_added')).toBe(CreativeCategory.ITEMS);
    });

    it('writes an empty menu as two empty lists', () => {
        const expected = new BinaryStream();
        expected.writeUnsignedVarInt(0x91); // Header.
        expected.writeUnsignedVarInt(0); // Groups.
        expected.writeUnsignedVarInt(0); // Entries.

        expect(encode(new CreativeContentPacket())).toEqual(expected.getBuffer());
    });

    it('reads the groups and the items back and consumes the whole buffer', () => {
        const input = new BinaryStream();
        input.writeUnsignedVarInt(0x91); // Header.
        input.writeUnsignedVarInt(2); // Groups.
        input.writeByte(CreativeCategory.CONSTRUCTION);
        writeString(input, 'itemGroup.name.planks');
        writeItem(input, 5, 1, 0);
        input.writeByte(CreativeCategory.ITEMS);
        writeString(input, '');
        writeAir(input);
        input.writeUnsignedVarInt(2); // Entries.
        input.writeUnsignedVarInt(1);
        writeItem(input, 5, 64, 0);
        input.writeUnsignedVarInt(0);
        input.writeUnsignedVarInt(2);
        writeItem(input, 9, 3, 7);
        input.writeUnsignedVarInt(1);

        const packet = decode(input.getBuffer());

        expect(packet.groups.map(({ category, name }) => ({ category, name }))).toEqual([
            { category: CreativeCategory.CONSTRUCTION, name: 'itemGroup.name.planks' },
            { category: CreativeCategory.ITEMS, name: '' }
        ]);
        expect(packet.groups[0]?.icon.getId()).toBe(5);
        expect(packet.groups[1]?.icon.getName()).toBe('minecraft:air');

        // The reader has no item table to resolve against, so an item comes back under its
        // wire id with the unknown name.
        expect(
            packet.entries.map(({ item, group }) => ({ id: item.getId(), count: item.count, meta: item.meta, group }))
        ).toEqual([
            { id: 5, count: 64, meta: 0, group: 0 },
            { id: 9, count: 3, meta: 7, group: 1 }
        ]);
        expect(packet.feof()).toBe(true);
    });
});
