import { describe, expect, it } from 'vitest';

import { MAX_COMMAND_LENGTH, parseFunctionSource } from './parse';

describe('parseFunctionSource', () => {
    it('keeps one command per line and numbers them from one', () => {
        const parsed = parseFunctionSource('say first\nsay second\n');

        expect(parsed.diagnostics).toEqual([]);
        expect(parsed.lines).toEqual([
            { line: 1, command: 'say first', macro: false },
            { line: 2, command: 'say second', macro: false }
        ]);
    });

    it('drops blank lines, whitespace-only lines and # comments', () => {
        const parsed = parseFunctionSource('# a comment\n\n   \n   # indented comment\nsay hello\n');

        expect(parsed.diagnostics).toEqual([]);
        expect(parsed.lines).toEqual([{ line: 5, command: 'say hello', macro: false }]);
    });

    it('trims surrounding whitespace from a command', () => {
        const parsed = parseFunctionSource('\t  say hello  \n');

        expect(parsed.lines).toEqual([{ line: 1, command: 'say hello', macro: false }]);
    });

    it('handles CRLF line endings', () => {
        const parsed = parseFunctionSource('say first\r\nsay second\r\n');

        expect(parsed.lines.map((line) => line.command)).toEqual(['say first', 'say second']);
    });

    it('marks a $-prefixed line as a macro and strips the marker', () => {
        const parsed = parseFunctionSource('$say hello $(name)\n');

        expect(parsed.diagnostics).toEqual([]);
        expect(parsed.lines).toEqual([{ line: 1, command: 'say hello $(name)', macro: true }]);
    });

    it('treats $ as a macro marker only as the first non-space character', () => {
        const parsed = parseFunctionSource('say $(name) costs $5\n');

        expect(parsed.lines[0]?.macro).toBe(false);
    });

    it('joins a line that ends with a backslash, stripping the next line whitespace', () => {
        const parsed = parseFunctionSource('say one \\\n   two \\\n   three\nsay after\n');

        expect(parsed.diagnostics).toEqual([]);
        expect(parsed.lines).toEqual([
            { line: 1, command: 'say one two three', macro: false },
            { line: 4, command: 'say after', macro: false }
        ]);
    });

    it('carries the macro marker across a continuation', () => {
        const parsed = parseFunctionSource('$say \\\n$(name)\n');

        expect(parsed.lines).toEqual([{ line: 1, command: 'say $(name)', macro: true }]);
    });

    it('reports a continuation with nothing to continue into', () => {
        const parsed = parseFunctionSource('say one \\\n');

        expect(parsed.lines).toEqual([]);
        expect(parsed.diagnostics).toEqual([
            {
                severity: 'error',
                code: 'line.dangling-continuation',
                line: 1,
                message: 'the file ends with a line continuation'
            }
        ]);
    });

    it('reports a // comment, because mcfunction comments use #', () => {
        const parsed = parseFunctionSource('// not a comment\n');

        expect(parsed.lines).toEqual([]);
        expect(parsed.diagnostics[0]?.code).toBe('line.double-slash-comment');
    });

    it('reports a leading slash on a command', () => {
        const parsed = parseFunctionSource('/say hello\n');

        expect(parsed.lines).toEqual([]);
        expect(parsed.diagnostics[0]?.code).toBe('line.leading-slash');
    });

    it('reports a command longer than the limit', () => {
        const parsed = parseFunctionSource(`say ${'a'.repeat(MAX_COMMAND_LENGTH)}`);

        expect(parsed.lines).toEqual([]);
        expect(parsed.diagnostics[0]?.code).toBe('line.too-long');
    });
});
