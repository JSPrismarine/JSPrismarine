import { assert, describe, it } from 'vitest';
import StringReader from '../StringReader';
import ParsedArgument from '../context/ParsedArgument';

describe('ParsedArgumentTest', () => {
    it.todo('testEquals', () => {
        /*testEquality(new ParsedArgument(0, 3, 'bar'), new ParsedArgument(0, 3, 'bar'));
        testEquality(new ParsedArgument(3, 6, 'baz'), new ParsedArgument(3, 6, 'baz'));
        testEquality(new ParsedArgument(6, 9, 'baz'), new ParsedArgument(6, 9, 'baz'));*/
    });

    it('getRaw', () => {
        const reader = new StringReader('0123456789');
        const argument = new ParsedArgument(2, 5, '');
        assert.equal(argument.getRange().get(reader), '234');
    });
});
