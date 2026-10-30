import { NBTTagCompound, Types } from '@jsprismarine/nbt';
import { describe, expect, it } from 'vitest';

import SyncActorPropertyPacket from './SyncActorPropertyPacket';

// Packet id 165 as a varuint.
const HEADER = [0xa5, 0x01];

// A network NBT compound with an int `type` and an empty `properties` sub-compound, written
// with varint lengths and an empty root name.
const PROPERTY_BYTES = [
    0x0a,
    0x00, // TAG_Compound, name ""
    0x03,
    0x04,
    ...Buffer.from('type', 'utf8'),
    0x02, // TAG_Int type = 1, ZigZag encoded as a varint
    0x0a,
    0x0a,
    ...Buffer.from('properties', 'utf8'),
    0x00, // empty sub-compound
    0x00 // TAG_End
];

describe('SyncActorPropertyPacket', () => {
    it('writes one network NBT compound and nothing else', () => {
        const compound = new NBTTagCompound();
        compound.addValue('type', new Types.NumberVal(1));
        compound.addChild(new NBTTagCompound('properties'));

        const packet = new SyncActorPropertyPacket();
        packet.propertyData = compound;
        packet.encode();

        expect(packet.getBuffer()).toEqual(Buffer.from([...HEADER, ...PROPERTY_BYTES]));
    });

    it('writes an empty compound as three bytes', () => {
        const packet = new SyncActorPropertyPacket();
        packet.encode();

        expect(packet.getBuffer()).toEqual(Buffer.from([...HEADER, 0x0a, 0x00, 0x00]));
    });

    it('reads the compound and consumes the whole buffer', () => {
        const packet = new SyncActorPropertyPacket();
        packet.setReadBuffer(Buffer.from([...HEADER, ...PROPERTY_BYTES]));
        packet.decode();

        expect(packet.propertyData.getNumber('type', 0)).toBe(1);
        expect(packet.propertyData.getCompound('properties', false)?.size()).toBe(0);
        expect(packet.feof()).toBe(true);
    });
});
