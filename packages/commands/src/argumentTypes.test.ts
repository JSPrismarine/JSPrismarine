import { IntegerArgumentType, StringReader } from '@jsprismarine/brigadier';
import { describe, expect, it } from 'vitest';

import {
    argumentWords,
    blockPositionArgument,
    commandArgument,
    entityArgument,
    jsonArgument,
    messageArgument,
    nbtPathArgument,
    nbtTagArgument,
    positionArgument,
    stringArgument
} from './argumentTypes';

const NO_SOURCE = { getSource: () => undefined };

/** How many words `type` consumes from a line that has more than it needs. */
function wordsRead(type: { parse(reader: StringReader, context: typeof NO_SOURCE): unknown }, line: string) {
    const reader = new StringReader(line);
    type.parse(reader, NO_SOURCE);
    const read = line.slice(0, reader.getCursor()).trim();
    return read === '' ? 0 : read.split(/\s+/).length;
}

describe('argumentWords', () => {
    const line = '1 2 3 4 5 6';
    const total = line.split(' ').length;

    it.each([
        ['a block position', blockPositionArgument()],
        ['a position', positionArgument()],
        ['a single word', stringArgument()],
        ['a selector', entityArgument()]
    ])('says how many words %s reads', (_, type) => {
        expect(argumentWords(type)).toBe(wordsRead(type, line));
    });

    it.each([
        ['a message', messageArgument()],
        ['raw text', jsonArgument()],
        ['a command', commandArgument()],
        ['an NBT tag', nbtTagArgument()]
    ])('says %s reads the rest of the line', (_, type) => {
        expect(argumentWords(type)).toBe('rest');
        expect(wordsRead(type, line)).toBe(total);
    });

    it('counts a type that does not say as one word', () => {
        expect(argumentWords(IntegerArgumentType.integer())).toBe(1);
        expect(argumentWords(undefined)).toBe(1);
    });
});

describe('nbtPathArgument', () => {
    const read = (line: string) => {
        const reader = new StringReader(line);
        const path = nbtPathArgument().parse(reader, NO_SOURCE);
        return { path, rest: reader.getRemaining() };
    };

    it('stops at the first space, as any other token does', () => {
        expect(read('a.b set value 1')).toEqual({ path: 'a.b', rest: ' set value 1' });
    });

    it('keeps a quoted key whole, quotes and all, wherever it stands', () => {
        expect(read('a."b c" 2')).toEqual({ path: 'a."b c"', rest: ' 2' });
        expect(read('"a b".c 2')).toEqual({ path: '"a b".c', rest: ' 2' });
        expect(read(String.raw`a."b\" c" 2`)).toEqual({ path: String.raw`a."b\" c"`, rest: ' 2' });
    });

    it('reads a pattern with spaces in it as part of the path', () => {
        expect(read('Items[{id: "minecraft:stone", Count: 1b}].tag 2')).toEqual({
            path: 'Items[{id: "minecraft:stone", Count: 1b}].tag',
            rest: ' 2'
        });
    });
});
