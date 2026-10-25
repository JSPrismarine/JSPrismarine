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

    // Strict JSON skips the cleanup, so the two paths have to agree on every text that could
    // take either. Each of these holds something the cleanup looks for - a `/`, a `,` before a
    // bracket, an escaped quote - inside a string, where it has to stay.
    it.each([
        '{"url": "https://example/*/x", "note": "a,} b", "escaped": "\\" // no"}',
        '[1, 2, [3, {"a": "/* not a comment */"}]]',
        '{"nested": {"deep": {"deeper": [true, false, null, -1.5e3]}}}'
    ])('reads strict JSON the same way the lenient cleanup would: %s', (text) => {
        expect(parseLenientJson(text)).toEqual(JSON.parse(text));
    });
});
