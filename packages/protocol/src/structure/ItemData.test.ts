import { NBTTagCompound } from '@jsprismarine/nbt';
import { describe, expect, it } from 'vitest';

import NetworkBinaryStream from '../NetworkBinaryStream';
import ItemData, { ItemVersion } from './ItemData';

const str = (text: string): number[] => {
    const utf8 = Buffer.from(text, 'utf-8');
    return [utf8.byteLength, ...utf8];
};

const encode = (data: ItemData): Buffer => {
    const stream = new NetworkBinaryStream();
    data.serialize(stream);
    return stream.getBuffer();
};

// One group per docs field, in wire order.
const stick = Buffer.from([
    ...str('minecraft:stick'), // Item Name
    0x40,
    0x01, // Item Id: int16 LE 320
    0x00, // Is Component Based
    0x04, // Item Version: varint32 ZigZag None (2)
    0x0a,
    0x00,
    0x00 // Item Component Data: empty network NBT compound
]);

describe('ItemData', () => {
    it('serializes a vanilla item in docs order', () => {
        expect(encode(new ItemData('minecraft:stick', 320, false, ItemVersion.NONE, new NBTTagCompound()))).toEqual(
            stick
        );
    });

    it('writes an empty compound when none is given', () => {
        expect(encode(new ItemData('minecraft:stick', 320, false, ItemVersion.NONE))).toEqual(stick);
    });

    it('writes a negative block item id as int16', () => {
        const bytes = encode(new ItemData('minecraft:oak_log', -10, false, ItemVersion.LEGACY));

        expect(bytes.subarray(str('minecraft:oak_log').length, str('minecraft:oak_log').length + 2)).toEqual(
            Buffer.from([0xf6, 0xff])
        );
    });

    it('deserializes a component based entry and consumes it all', () => {
        const stream = new NetworkBinaryStream(
            Buffer.from([
                ...str('custom:wand'),
                0xe8,
                0x03, // Item Id: int16 LE 1000
                0x01, // Is Component Based
                0x02, // Item Version: ZigZag DataDriven (1)
                0x0a, // TAG_Compound
                0x00, // root name: varuint length 0
                0x01, // TAG_Byte
                ...str('glow'),
                0x07, // value
                0x00 // TAG_End
            ])
        );
        const data = ItemData.deserialize(stream);

        expect(data.itemName).toBe('custom:wand');
        expect(data.itemId).toBe(1000);
        expect(data.componentBased).toBe(true);
        expect(data.version).toBe(ItemVersion.DATA_DRIVEN);
        expect(data.componentData.getByte('glow', 0)).toBe(7);
        expect(stream.feof()).toBe(true);
    });
});
