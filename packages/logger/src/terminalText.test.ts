import { describe, expect, it } from 'vitest';

import { terminalText } from './terminalText';

describe('terminalText', () => {
    it.each([
        ['a color', 'red \u001B[31mtext\u001B[0m', 'red text'],
        ['a cursor move and screen clear', 'a\u001B[2J\u001B[1;1Hb', 'ab'],
        ['a window title (OSC, BEL)', '\u001B]0;owned\u0007hello', 'hello'],
        ['a hyperlink (OSC, ST)', '\u001B]8;;https://example.com\u001B\\link\u001B]8;;\u001B\\', 'link'],
        ['an unterminated OSC', 'ok\u001B]0;title', 'ok'],
        ['an 8-bit CSI', 'x\u009B2Ky', 'xy'],
        ['a DCS string', 'p\u001BPq#0\u001B\\q', 'pq'],
        ['a two-byte escape', 'a\u001BcB', 'aB'],
        ['a carriage return and backspace', 'fake\rreal\b!', 'fakereal!'],
        ['a bidirectional override', 'abc‮def', 'abcdef'],
        ['a lone escape', 'end\u001B', 'end']
    ])('removes %s', (_name, input, expected) => {
        expect(terminalText(input)).toBe(expected);
    });

    it('keeps plain text, tabs, line feeds and Minecraft color codes', () => {
        const text = '§aWelcome\tto\nthe server ✓';
        expect(terminalText(text)).toBe(text);
    });
});
