import { IntegerArgumentType, StringReader } from '@jsprismarine/brigadier';
import { describe, expect, it } from 'vitest';

import {
    argumentWords,
    blockPositionArgument,
    commandArgument,
    entityArgument,
    jsonArgument,
    messageArgument,
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
