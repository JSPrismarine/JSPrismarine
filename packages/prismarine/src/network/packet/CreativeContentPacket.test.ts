import BinaryStream from '@jsprismarine/binaryutils';
import { describe, expect, it } from 'vitest';

import { Item } from '../../item/Item';
import CreativeContentPacket, { CreativeCategory } from './CreativeContentPacket';

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
    it('writes one anonymous group and then every entry filed under it', () => {
        const stick = new Item({ id: 280, name: 'minecraft:stick', count: 64 });
        const dyedStick = new Item({ id: 280, name: 'minecraft:stick', meta: 2, count: 1 });

        const packet = new CreativeContentPacket();
        packet.items = [stick, dyedStick];

        const expected = new BinaryStream();
        expected.writeUnsignedVarInt(0x91); // Header.
        expected.writeUnsignedVarInt(1); // Groups.
        expected.writeByte(CreativeCategory.ITEMS); // Creative Category.
        expected.writeUnsignedVarInt(0); // Name: empty, so the group is anonymous.
        writeAir(expected); // Group Icon Item.
        expected.writeUnsignedVarInt(2); // Entries.
        expected.writeUnsignedVarInt(1); // Creative Net Id, one-based.
        writeItem(expected, stick.getNetworkId(), 64, 0); // Item Instance.
        expected.writeUnsignedVarInt(0); // Group Index.
        expected.writeUnsignedVarInt(2);
        writeItem(expected, dyedStick.getNetworkId(), 1, 2);
        expected.writeUnsignedVarInt(0);

        expect(encode(packet)).toEqual(expected.getBuffer());
    });

    it('writes an empty menu as two empty lists, with no group to head nothing', () => {
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
        expect(packet.items.map((item) => ({ id: item.getId(), count: item.count, meta: item.meta }))).toEqual([
            { id: 5, count: 64, meta: 0 },
            { id: 9, count: 3, meta: 7 }
        ]);
        expect(packet.feof()).toBe(true);
    });
});
