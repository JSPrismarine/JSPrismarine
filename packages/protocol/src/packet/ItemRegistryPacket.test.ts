import { NBTTagCompound, Types } from '@jsprismarine/nbt';
import { describe, expect, it } from 'vitest';

import NetworkBinaryStream from '../NetworkBinaryStream';
import { ItemVersion } from '../structure/ItemData';
import ItemRegistryPacket from './ItemRegistryPacket';

import type { ItemRegistryEntry } from './ItemRegistryPacket';

/** Packet id 162 as a varuint. */
const HEADER = [0xa2, 0x01];

const str = (text: string): number[] => {
    const utf8 = Buffer.from(text, 'utf-8');
    return [utf8.byteLength, ...utf8];
};

const int16le = (value: number): number[] => {
    const buffer = Buffer.alloc(2);
    buffer.writeInt16LE(value);
    return [...buffer];
};

/** `minecraft:oak_log`, a block's item form with a negative `Item Id`, `Legacy`, no components. */
const OAK_LOG = [
    ...str('minecraft:oak_log'),
    ...int16le(-10),
    0x00, // Is Component Based
    0x00, // Item Version Legacy (0), ZigZag 0
    0x0a,
    0x00,
    0x00 // empty Item Component Data
];

/** A component based item whose compound holds one byte tag, so the reader has to keep it. */
const CUSTOM_WAND = [
    ...str('custom:wand'),
    ...int16le(1000),
    0x01, // Is Component Based
    0x02, // Item Version DataDriven (1), ZigZag 2
    0x0a, // TAG_Compound
    0x00, // empty root name
    0x01, // TAG_Byte
    ...str('glow'),
    0x07, // value
    0x00 // TAG_End
];

const PACKET = Buffer.from([...HEADER, 0x02, ...OAK_LOG, ...CUSTOM_WAND]);

const wandComponents = (): NBTTagCompound => {
    const compound = new NBTTagCompound();
    compound.addValue('glow', new Types.ByteVal(7));
    return compound;
};

const oakLog: ItemRegistryEntry = {
    name: 'minecraft:oak_log',
    runtimeId: -10,
    componentBased: false,
    version: ItemVersion.LEGACY
};

const wand: ItemRegistryEntry = {
    name: 'custom:wand',
    runtimeId: 1000,
    componentBased: true,
    version: ItemVersion.DATA_DRIVEN,
    componentData: wandComponents()
};

describe('ItemRegistryPacket', () => {
    it('reads each Item Data entry in docs order and keeps the component compound', () => {
        const stream = new NetworkBinaryStream(PACKET);
        const data = new ItemRegistryPacket().deserialize(stream);

        expect(data.items).toHaveLength(2);
        expect(data.items[0]).toMatchObject({
            name: 'minecraft:oak_log',
            runtimeId: -10,
            componentBased: false,
            version: 0
        });
        expect(data.items[0]?.componentData?.size()).toBe(0);
        expect(data.items[1]).toMatchObject({ name: 'custom:wand', runtimeId: 1000, componentBased: true, version: 1 });
        expect(data.items[1]?.componentData?.getByte('glow', 0)).toBe(7);
        expect(stream.feof()).toBe(true);
    });

    it('writes the same bytes, with an empty compound for an entry that gives none', () => {
        const bytes = new ItemRegistryPacket({ items: [oakLog, wand] }).serialize(new NetworkBinaryStream());

        expect(bytes).toEqual(PACKET);
    });

    it('round-trips a component based entry', () => {
        const bytes = new ItemRegistryPacket({ items: [wand] }).serialize(new NetworkBinaryStream());
        const data = new ItemRegistryPacket().deserialize(new NetworkBinaryStream(bytes));

        expect(data.items[0]).toMatchObject({ name: 'custom:wand', runtimeId: 1000, componentBased: true, version: 1 });
        expect(data.items[0]?.componentData?.getByte('glow', 0)).toBe(7);
    });

    it('reads an empty table and stops at the count', () => {
        const stream = new NetworkBinaryStream(Buffer.from([...HEADER, 0x00]));
        const data = new ItemRegistryPacket().deserialize(stream);

        expect(data.items).toEqual([]);
        expect(stream.feof()).toBe(true);
    });

    it('writes an empty table as the header and a zero count', () => {
        const bytes = new ItemRegistryPacket({ items: [] }).serialize(new NetworkBinaryStream());

        expect(bytes).toEqual(Buffer.from([...HEADER, 0x00]));
    });
});
