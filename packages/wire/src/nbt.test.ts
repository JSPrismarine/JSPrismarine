import { block_definitions } from '@jsprismarine/bedrock-data';
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

    it('refuses a raw JavaScript value, which would otherwise pick a tag type by accident', () => {
        // @ts-expect-error - a bare number is not a tag, and that is the point.
        expect(() => nbtToPlain(nbtCompound({ loose: 1 }))).toThrow(TypeError);
    });
});

describe('a round trip of what a real server sent', () => {
    it('reads and rewrites all 98 captured block definitions byte for byte', () => {
        const rewritten = block_definitions.filter((entry) =>
            writeNetworkNbt(readNetworkNbt(entry.definition)).equals(entry.definition)
        );

        expect(rewritten).toHaveLength(98);
    });
});
