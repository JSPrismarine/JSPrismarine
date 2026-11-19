import { assert, describe, it } from 'vitest';
import StringReader from '../StringReader';
import ParsedArgument from '../context/ParsedArgument';

describe('ParsedArgumentTest', () => {
    it('getRaw', () => {
        const reader = new StringReader('0123456789');
        const argument = new ParsedArgument(2, 5, '');
        assert.equal(argument.getRange().get(reader), '234');
    });
});
