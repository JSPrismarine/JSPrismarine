import { DataItemType } from '@jsprismarine/minecraft';
import { NBTTagCompound, Types } from '@jsprismarine/nbt';
import { describe, expect, it } from 'vitest';

import NetworkBinaryStream from '../NetworkBinaryStream';
import BlockPos from './BlockPos';
import { DataItem } from './DataItem';
import Vec3 from './Vec3';

import type { DataItemEntry } from './DataItem';

const roundTrip = (id: number, entry: DataItemEntry): DataItem => {
    const stream = new NetworkBinaryStream();
    new DataItem(id, entry).serialize(stream);

    const input = new NetworkBinaryStream(stream.getBuffer());
    const read = new DataItem(0, { type: DataItemType.BYTE, value: 0 });
    read.deserialize(input);
    expect(input.feof()).toBe(true);
    return read;
};

describe('DataItem', () => {
    const scalars: DataItemEntry[] = [
        { type: DataItemType.BYTE, value: 7 },
        { type: DataItemType.SHORT, value: -300 },
        { type: DataItemType.INT, value: 123456 },
        { type: DataItemType.FLOAT, value: 1.5 },
        { type: DataItemType.STRING, value: 'hello' },
        { type: DataItemType.LONG, value: 1n << 40n }
    ];

    it.each(scalars)('round-trips type $type', (entry) => {
        const item = roundTrip(3, entry);

        expect(item.getId()).toBe(3);
        expect(item.getType()).toBe(entry.type);
        expect(item.getValue()).toBe(entry.value);
    });

    it('round-trips a POS value as a BlockPos instance', () => {
        const item = roundTrip(4, { type: DataItemType.POS, value: new BlockPos(1, -2, 3) });
        const value = item.getValue();

        expect(item.getType()).toBe(DataItemType.POS);
        expect(value).toBeInstanceOf(BlockPos);
        expect(value).toEqual(new BlockPos(1, -2, 3));
    });

    it('round-trips a VEC3 value as a Vec3 instance', () => {
        const item = roundTrip(5, { type: DataItemType.VEC3, value: new Vec3(0.5, 1.5, -2.5) });
        const value = item.getValue();

        expect(item.getType()).toBe(DataItemType.VEC3);
        expect(value).toBeInstanceOf(Vec3);
        expect(value).toEqual(new Vec3(0.5, 1.5, -2.5));
    });

    it('round-trips a COMPOUND_TAG value', () => {
        const tag = new NBTTagCompound('root');
        tag.addValue('name', new Types.StringVal('steve'));
        const item = roundTrip(6, { type: DataItemType.COMPOUND_TAG, value: tag });
        const value = item.getValue();

        expect(item.getType()).toBe(DataItemType.COMPOUND_TAG);
        expect(value).toBeInstanceOf(NBTTagCompound);
        expect(value instanceof NBTTagCompound && value.getString('name', '')).toBe('steve');
    });

    it('serializes a decoded POS value again without throwing', () => {
        const item = roundTrip(4, { type: DataItemType.POS, value: new BlockPos(1, 2, 3) });
        const stream = new NetworkBinaryStream();

        expect(() => item.serialize(stream)).not.toThrow();
        expect(stream.getBuffer().length).toBeGreaterThan(0);
    });

    it('rejects an unknown type byte', () => {
        const stream = new NetworkBinaryStream();
        stream.writeUnsignedVarInt(9);
        stream.writeSignedByte(42);

        const item = new DataItem(0, { type: DataItemType.BYTE, value: 0 });
        expect(() => item.deserialize(new NetworkBinaryStream(stream.getBuffer()))).toThrow(/unknown type 42/);
    });
});
