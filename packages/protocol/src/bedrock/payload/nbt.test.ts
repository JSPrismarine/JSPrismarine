import { block_definitions } from '@jsprismarine/bedrock-data';
import { Types } from '@jsprismarine/nbt';
import { describe, expect, it } from 'vitest';

import {
    nbtByte,
    nbtCompound,
    nbtFloat,
    nbtInt,
    nbtList,
    nbtString,
    nbtToPlain,
    readNetworkNbt,
    writeNetworkNbt
} from './nbt';

describe('the NBT builder', () => {
    it('sorts a compound by key, which is what the captured server does', () => {
        const compound = nbtCompound({ zebra: nbtInt(1), apple: nbtInt(2), middle: nbtInt(3) });

        expect([...compound.entries()].map(([key]) => key)).toEqual(['apple', 'middle', 'zebra']);
    });

    it('leaves out an undefined entry rather than writing an empty tag', () => {
        const compound = nbtCompound({ here: nbtInt(1), gone: undefined });

        expect([...compound.entries()].map(([key]) => key)).toEqual(['here']);
    });

    it('names a nested compound after the key it sits under, which the writer requires', () => {
        const compound = nbtCompound({ inner: nbtCompound({ value: nbtInt(1) }) });

        expect(compound.getCompound('inner', false)?.getName()).toBe('inner');
    });

    it('keeps a tag type through a write and a read', () => {
        const compound = nbtCompound({
            flag: nbtByte(true),
            count: nbtInt(7),
            amount: nbtFloat(0.5),
            label: nbtString('a'),
            list: nbtList([nbtString('x'), nbtString('y')]),
            nested: nbtCompound({ deep: nbtByte(3) })
        });

        expect(nbtToPlain(readNetworkNbt(writeNetworkNbt(compound)))).toEqual({
            amount: 'float:0.5',
            count: 'int:7',
            flag: 'byte:1',
            label: 'string:a',
            list: ['string:x', 'string:y'],
            nested: { deep: 'byte:3' }
        });
    });

    it('prefixes every scalar tag with its own type', () => {
        expect(
            [
                new Types.ByteVal(1),
                new Types.ShortVal(2),
                new Types.NumberVal(3),
                new Types.LongVal(4n),
                new Types.FloatVal(0.1),
                new Types.DoubleVal(0.1),
                new Types.StringVal('s')
            ].map(nbtToPlain)
        ).toEqual(['byte:1', 'short:2', 'int:3', 'long:4', `float:${Math.fround(0.1)}`, 'double:0.1', 'string:s']);
    });

    it('refuses null and plain objects, which are not tags', () => {
        expect(() => nbtToPlain(null)).toThrow(TypeError);
        expect(() => nbtToPlain({ getValue: () => 1 })).toThrow(TypeError);
    });

    it('refuses a raw JavaScript value, which would otherwise pick a tag type by accident', () => {
        // @ts-expect-error - a bare number is not a tag, and that is the point.
        expect(() => nbtToPlain(nbtCompound({ loose: 1 }))).toThrow(TypeError);
    });
});

describe('a round trip of what a real server sent', () => {
    it('reads and rewrites every captured block definition byte for byte', () => {
        const rewritten = block_definitions.filter((entry) =>
            writeNetworkNbt(readNetworkNbt(entry.definition)).equals(entry.definition)
        );

        expect(block_definitions.length).toBeGreaterThan(0);
        expect(rewritten).toHaveLength(block_definitions.length);
    });
});
