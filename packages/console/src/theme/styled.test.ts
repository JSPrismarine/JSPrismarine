import type { StyledText } from '@opentui/core';
import { parseColor, TextAttributes } from '@opentui/core';
import { describe, expect, it } from 'vitest';
import { levelToken, LEVEL_TOKEN_WIDTH, plainChunk, styleMinecraftText } from './styled';
import { defaultTheme, LEVEL_ROLES, monochromeTheme } from './theme';

const theme = defaultTheme;
const chatColor = (code: keyof typeof theme.chat) => parseColor(theme.chat[code]);

const summarize = (styled: StyledText) =>
    styled.chunks.map(({ text, fg, attributes }) => ({ text, fg: fg?.toInts(), attributes }));

describe('styleMinecraftText', () => {
    it('returns one chunk in the text role when there are no codes', () => {
        const styled = styleMinecraftText('Hello world', theme);

        expect(summarize(styled)).toEqual([
            { text: 'Hello world', fg: parseColor(theme.text).toInts(), attributes: TextAttributes.NONE }
        ]);
        expect(styled.chunks[0]?.__isChunk).toBe(true);
    });

    it('returns no chunks for an empty string', () => {
        expect(styleMinecraftText('', theme).chunks).toEqual([]);
    });

    it('colors the text after a color code', () => {
        expect(summarize(styleMinecraftText('§cHello §eworld', theme))).toEqual([
            { text: 'Hello ', fg: chatColor('c').toInts(), attributes: TextAttributes.NONE },
            { text: 'world', fg: chatColor('e').toInts(), attributes: TextAttributes.NONE }
        ]);
    });

    it('keeps formatting across a color code and stacks format codes', () => {
        expect(summarize(styleMinecraftText('§l§cbold red §nunderlined', theme))).toEqual([
            { text: 'bold red ', fg: chatColor('c').toInts(), attributes: TextAttributes.BOLD },
            {
                text: 'underlined',
                fg: chatColor('c').toInts(),
                attributes: TextAttributes.BOLD | TextAttributes.UNDERLINE
            }
        ]);
    });

    it('maps italic and strikethrough and renders obfuscated as plain', () => {
        expect(summarize(styleMinecraftText('§oi§r§ms§r§kk', theme))).toEqual([
            { text: 'i', fg: parseColor(theme.text).toInts(), attributes: TextAttributes.ITALIC },
            { text: 's', fg: parseColor(theme.text).toInts(), attributes: TextAttributes.STRIKETHROUGH },
            { text: 'k', fg: parseColor(theme.text).toInts(), attributes: TextAttributes.NONE }
        ]);
    });

    it('resets color and formatting on §r', () => {
        expect(summarize(styleMinecraftText('§a§lgo§rplain', theme))).toEqual([
            { text: 'go', fg: chatColor('a').toInts(), attributes: TextAttributes.BOLD },
            { text: 'plain', fg: parseColor(theme.text).toInts(), attributes: TextAttributes.NONE }
        ]);
    });

    it('drops a trailing code and emits nothing for codes without text', () => {
        expect(summarize(styleMinecraftText('done§r', theme))).toEqual([
            { text: 'done', fg: parseColor(theme.text).toInts(), attributes: TextAttributes.NONE }
        ]);
        expect(styleMinecraftText('§c§l', theme).chunks).toEqual([]);
    });

    it('passes unknown codes and a lone § through as text', () => {
        expect(summarize(styleMinecraftText('§zodd§', theme))).toEqual([
            { text: '§zodd§', fg: parseColor(theme.text).toInts(), attributes: TextAttributes.NONE }
        ]);
    });

    it('does not treat uppercase codes as codes, like the server console parser', () => {
        expect(styleMinecraftText('§Cx', theme).chunks.map(({ text }) => text)).toEqual(['§Cx']);
    });

    it('uses the theme chat palette, so NO_COLOR keeps attributes without color', () => {
        expect(summarize(styleMinecraftText('§c§lalert', monochromeTheme))).toEqual([
            { text: 'alert', fg: parseColor(monochromeTheme.text).toInts(), attributes: TextAttributes.BOLD }
        ]);
    });
});

describe('plainChunk', () => {
    it('builds a chunk in the given role with optional attributes', () => {
        const chunk = plainChunk('Network', theme, 'accent', TextAttributes.DIM);

        expect(chunk.__isChunk).toBe(true);
        expect(chunk.text).toBe('Network');
        expect(chunk.fg?.toInts()).toEqual(parseColor(theme.accent).toInts());
        expect(chunk.attributes).toBe(TextAttributes.DIM);
    });

    it('defaults to the text role with no attributes', () => {
        const chunk = plainChunk('x', theme);

        expect(chunk.fg?.toInts()).toEqual(parseColor(theme.text).toInts());
        expect(chunk.attributes).toBe(TextAttributes.NONE);
    });
});

describe('levelToken', () => {
    it('pads every level to the same width in upper case', () => {
        for (const level of LEVEL_ROLES) {
            const token = levelToken(level, theme);
            expect(token.text, level).toBe(level.toUpperCase().padEnd(LEVEL_TOKEN_WIDTH));
            expect(token.text.length, level).toBe(LEVEL_TOKEN_WIDTH);
        }
        expect(LEVEL_TOKEN_WIDTH).toBe(7);
    });

    it('colors the token with the level role', () => {
        expect(levelToken('warn', theme).fg?.toInts()).toEqual(parseColor(theme.warn).toInts());
    });

    it('emphasizes with attributes so NO_COLOR still distinguishes levels', () => {
        expect(levelToken('error', monochromeTheme).attributes).toBe(TextAttributes.BOLD);
        expect(levelToken('warn', monochromeTheme).attributes).toBe(TextAttributes.BOLD);
        expect(levelToken('info', monochromeTheme).attributes).toBe(TextAttributes.NONE);
        expect(levelToken('verbose', monochromeTheme).attributes).toBe(TextAttributes.DIM);
        expect(levelToken('debug', monochromeTheme).attributes).toBe(TextAttributes.DIM);
        expect(levelToken('silly', monochromeTheme).attributes).toBe(TextAttributes.DIM);
    });
});
