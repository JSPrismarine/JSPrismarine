import { describe, expect, it } from 'vitest';

import { JsonParseError, parseLenientJson } from './lenientJson';

describe('parseLenientJson', () => {
    it('parses plain JSON', () => {
        expect(parseLenientJson('{"a": [1, 2]}')).toEqual({ a: [1, 2] });
    });

    it('accepts line comments', () => {
        expect(parseLenientJson('{\n// a comment\n"a": 1 // trailing\n}')).toEqual({ a: 1 });
    });

    it('accepts block comments, including multi-line ones', () => {
        expect(parseLenientJson('{"a": /* inline */ 1, /* spans\nlines */ "b": 2}')).toEqual({ a: 1, b: 2 });
    });

    it('accepts trailing commas in objects and arrays', () => {
        expect(parseLenientJson('{"a": [1, 2,], "b": {"c": 3,},}')).toEqual({ a: [1, 2], b: { c: 3 } });
    });

    it('accepts a trailing comma followed by a comment', () => {
        expect(parseLenientJson('{"a": 1, // why\n}')).toEqual({ a: 1 });
    });

    it('leaves comment-looking and comma-bracket text inside strings alone', () => {
        expect(parseLenientJson('{"url": "https://a/*b", "text": "x,}"}')).toEqual({
            url: 'https://a/*b',
            text: 'x,}'
        });
    });

    it('handles escaped quotes inside strings', () => {
        expect(parseLenientJson('{"a": "say \\"hi\\", // not a comment"}')).toEqual({
            a: 'say "hi", // not a comment'
        });
    });

    it('throws JsonParseError on malformed JSON', () => {
        expect(() => parseLenientJson('{"a": }')).toThrow(JsonParseError);
    });
});
