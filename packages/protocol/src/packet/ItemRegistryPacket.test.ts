import { describe, expect, it } from 'vitest';

import NetworkBinaryStream from '../NetworkBinaryStream';
import ItemRegistryPacket from './ItemRegistryPacket';

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

/** A component based item whose compound holds one byte tag, so the reader has to skip it. */
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

describe('ItemRegistryPacket', () => {
    it('reads each Item Data entry in docs order and skips the component compound', () => {
        const stream = new NetworkBinaryStream(PACKET);
        const data = new ItemRegistryPacket().deserialize(stream);

        expect(data.items).toEqual([
            { name: 'minecraft:oak_log', runtimeId: -10, componentBased: false, version: 0 },
            { name: 'custom:wand', runtimeId: 1000, componentBased: true, version: 1 }
        ]);
        expect(stream.feof()).toBe(true);
    });

    it('reads an empty table and stops at the count', () => {
        const stream = new NetworkBinaryStream(Buffer.from([...HEADER, 0x00]));
        const data = new ItemRegistryPacket().deserialize(stream);

        expect(data.items).toEqual([]);
        expect(stream.feof()).toBe(true);
    });

    it('refuses to serialize, since the component trees are not modeled', () => {
        const packet = new ItemRegistryPacket({ items: [] });

        expect(() => packet.serialize(new NetworkBinaryStream())).toThrow(/decode-only/);
    });
});
