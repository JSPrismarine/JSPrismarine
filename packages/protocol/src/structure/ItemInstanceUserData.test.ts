import { NBTTagCompound, Types } from '@jsprismarine/nbt';
import { describe, expect, it } from 'vitest';

import NetworkBinaryStream from '../NetworkBinaryStream';
import ItemInstanceUserData from './ItemInstanceUserData';

/** A block name as the lists carry it: int16 LE length, then UTF-8. */
const blockName = (name: string): number[] => {
    const utf8 = Buffer.from(name, 'utf-8');
    return [utf8.byteLength, 0x00, ...utf8];
};

const NO_LIST = [0x00, 0x00, 0x00, 0x00];

const encode = (data: ItemInstanceUserData): Buffer => {
    const stream = new NetworkBinaryStream();
    data.serialize(stream);
    return stream.getBuffer();
};

describe('ItemInstanceUserData', () => {
    describe('without a compound', () => {
        const wire = Buffer.from([
            0x00,
            0x00, // marker: int16 LE 0, no compound
            0x01,
            0x00,
            0x00,
            0x00, // Can Place On: uint32 LE count 1
            ...blockName('minecraft:stone'),
            ...NO_LIST // Can Destroy: uint32 LE count 0
        ]);

        it('writes a zero marker and the block lists', () => {
            expect(encode(new ItemInstanceUserData(null, { canPlaceOnBlocks: ['minecraft:stone'] }))).toEqual(wire);
        });

        it('reads the blob back and consumes it all', () => {
            const stream = new NetworkBinaryStream(wire);
            const data = ItemInstanceUserData.deserialize(stream);

            expect(data.userDataTag).toBeNull();
            expect(data.canPlaceOnBlocks).toEqual(['minecraft:stone']);
            expect(data.canDestroyBlocks).toEqual([]);
            expect(data.blockingTick).toBeNull();
            expect(stream.feof()).toBe(true);
        });
    });

    describe('with a compound', () => {
        const wire = Buffer.from([
            0xff,
            0xff, // marker: int16 LE -1, a compound follows
            0x01, // version
            0x0a, // TAG_Compound
            0x00,
            0x00, // root name: uint16 LE length 0
            0x01, // TAG_Byte
            0x01,
            0x00, // name length: uint16 LE 1
            0x61, // 'a'
            0x01, // value
            0x00, // TAG_End
            ...NO_LIST,
            ...NO_LIST
        ]);

        const tag = (): NBTTagCompound => {
            const compound = new NBTTagCompound();
            compound.addValue('a', new Types.ByteVal(1));
            return compound;
        };

        it('writes the marker, the version byte and plain little-endian NBT', () => {
            expect(encode(new ItemInstanceUserData(tag()))).toEqual(wire);
        });

        it('reads the compound back and consumes it all', () => {
            const stream = new NetworkBinaryStream(wire);
            const data = ItemInstanceUserData.deserialize(stream);

            expect(data.userDataTag).toBeInstanceOf(NBTTagCompound);
            expect(data.userDataTag?.getByte('a', 0)).toBe(1);
            expect(data.canPlaceOnBlocks).toEqual([]);
            expect(data.canDestroyBlocks).toEqual([]);
            expect(stream.feof()).toBe(true);
        });

        it('rejects a version byte other than 1', () => {
            const stream = new NetworkBinaryStream(Buffer.from([0xff, 0xff, 0x02]));

            expect(() => new ItemInstanceUserData().deserialize(stream)).toThrow(/version 2/);
        });

        it('rejects a marker that is neither 0 nor -1', () => {
            const stream = new NetworkBinaryStream(Buffer.from([0x05, 0x00]));

            expect(() => new ItemInstanceUserData().deserialize(stream)).toThrow(/marker 5/);
        });
    });

    describe('for a shield', () => {
        const wire = Buffer.from([
            0x00,
            0x00, // marker
            ...NO_LIST,
            ...NO_LIST,
            0x07,
            0x00,
            0x00,
            0x00,
            0x00,
            0x00,
            0x00,
            0x00 // Blocking Tick: int64 LE 7
        ]);

        it('writes the blocking tick after the lists', () => {
            expect(encode(new ItemInstanceUserData(null, { blockingTick: 7n }))).toEqual(wire);
        });

        it('reads the tick only when told the item is a shield', () => {
            const asShield = new NetworkBinaryStream(wire);
            const shield = new ItemInstanceUserData();
            shield.deserialize(asShield, true);

            expect(shield.blockingTick).toBe(7n);
            expect(asShield.feof()).toBe(true);

            const asOther = new NetworkBinaryStream(wire);
            const other = new ItemInstanceUserData();
            other.deserialize(asOther, false);

            expect(other.blockingTick).toBeNull();
            expect(asOther.readRemaining()).toHaveLength(8);
        });
    });
});
