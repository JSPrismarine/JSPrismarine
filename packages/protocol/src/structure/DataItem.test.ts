import { DataItemType } from '@jsprismarine/minecraft';
import { NBTTagCompound, Types } from '@jsprismarine/nbt';
import { describe, expect, it } from 'vitest';

import NetworkBinaryStream from '../NetworkBinaryStream';
import BlockPos from './BlockPos';
import { DataItem } from './DataItem';
import Vec3 from './Vec3';

import type { DataItemEntry } from './DataItem';

const encode = (id: number, entry: DataItemEntry): Buffer => {
    const stream = new NetworkBinaryStream();
    new DataItem(id, entry).serialize(stream);
    return stream.getBuffer();
};

const decode = (bytes: Buffer): DataItem => {
    const input = new NetworkBinaryStream(bytes);
    const read = new DataItem(0, { type: DataItemType.BYTE, value: 0 });
    read.deserialize(input);
    expect(input.feof()).toBe(true);
    return read;
};

const roundTrip = (id: number, entry: DataItemEntry): DataItem => decode(encode(id, entry));

/**
 * Hand-built vectors in docs order: `ID` varuint, one-of selector varuint, the variant's
 * `Type` byte, then the `Value`.
 */
const vectors: Array<{ name: string; id: number; entry: DataItemEntry; bytes: number[] }> = [
    { name: 'BYTE as int8', id: 0, entry: { type: DataItemType.BYTE, value: 5 }, bytes: [0x00, 0x00, 0x00, 0x05] },
    {
        name: 'SHORT as int16 LE',
        id: 1,
        entry: { type: DataItemType.SHORT, value: -300 },
        bytes: [0x01, 0x01, 0x01, 0xd4, 0xfe]
    },
    {
        name: 'INT as ZigZag varint32',
        id: 2,
        entry: { type: DataItemType.INT, value: 300 },
        bytes: [0x02, 0x02, 0x02, 0xd8, 0x04]
    },
    {
        name: 'FLOAT as float LE',
        id: 3,
        entry: { type: DataItemType.FLOAT, value: 1.5 },
        bytes: [0x03, 0x03, 0x03, 0x00, 0x00, 0xc0, 0x3f]
    },
    {
        name: 'STRING as varuint length and UTF-8',
        id: 4,
        entry: { type: DataItemType.STRING, value: 'hi' },
        bytes: [0x04, 0x04, 0x04, 0x02, 0x68, 0x69]
    },
    {
        name: 'POS as three ZigZag varint32',
        id: 6,
        entry: { type: DataItemType.POS, value: new BlockPos(1, -2, 3) },
        bytes: [0x06, 0x06, 0x06, 0x02, 0x03, 0x06]
    },
    {
        name: 'LONG as ZigZag varint64',
        id: 7,
        entry: { type: DataItemType.LONG, value: -2n },
        bytes: [0x07, 0x07, 0x07, 0x03]
    },
    {
        name: 'VEC3 as three floats LE',
        id: 8,
        entry: { type: DataItemType.VEC3, value: new Vec3(0.5, 1.5, -2.5) },
        bytes: [0x08, 0x08, 0x08, 0x00, 0x00, 0x00, 0x3f, 0x00, 0x00, 0xc0, 0x3f, 0x00, 0x00, 0x20, 0xc0]
    }
];

describe('DataItem', () => {
    it.each(vectors)('writes $name in docs order', ({ id, entry, bytes }) => {
        expect(encode(id, entry)).toEqual(Buffer.from(bytes));
    });

    it.each(vectors)('reads $name back and consumes the buffer', ({ id, entry, bytes }) => {
        const item = decode(Buffer.from(bytes));

        expect(item.getId()).toBe(id);
        expect(item.getType()).toBe(entry.type);
        expect(item.getValue()).toEqual(entry.value);
    });

    it('reads a negative BYTE value as a signed int8', () => {
        const item = decode(Buffer.from([0x00, 0x00, 0x00, 0xff]));

        expect(item.getValue()).toBe(-1);
    });

    it('round-trips a LONG above 2^53 without losing precision', () => {
        const item = roundTrip(3, { type: DataItemType.LONG, value: 1n << 60n });

        expect(item.getValue()).toBe(1n << 60n);
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

    it('rejects a selector that does not match the type byte', () => {
        const bytes = Buffer.from([0x09, 0x01, 0x02, 0x00, 0x00]);
        const item = new DataItem(0, { type: DataItemType.BYTE, value: 0 });

        expect(() => item.deserialize(new NetworkBinaryStream(bytes))).toThrow(/selects payload 1 but carries type 2/);
    });

    it('rejects an unknown type', () => {
        const bytes = Buffer.from([0x09, 0x2a, 0x2a]);
        const item = new DataItem(0, { type: DataItemType.BYTE, value: 0 });

        expect(() => item.deserialize(new NetworkBinaryStream(bytes))).toThrow(/unknown type 42/);
    });
});
