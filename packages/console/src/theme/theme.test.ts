import { LOG_LEVELS } from '@jsprismarine/logger';
import { parseColor, RGBA } from '@opentui/core';
import { describe, expect, expectTypeOf, it } from 'vitest';
import { MINECRAFT_COLORS } from './minecraftColors';
import type { ThemeRole } from './theme';
import { ansiTheme, defaultTheme, LEVEL_ROLES, monochromeTheme, resolveTheme, THEME_ROLES } from './theme';

const themes = { defaultTheme, ansiTheme, monochromeTheme };

describe('theme roles', () => {
    it('derives the role type from the role list', () => {
        expectTypeOf<ThemeRole>().toEqualTypeOf<(typeof THEME_ROLES)[number]>();
        // @ts-expect-error not a declared role
        const unknownRole: ThemeRole = 'glow';
        void unknownRole;
    });

    it('covers exactly the levels the logger emits', () => {
        expect(LEVEL_ROLES).toEqual(LOG_LEVELS);
    });

    it.each(Object.entries(themes))('%s resolves every role and chat color', (_, theme) => {
        for (const role of THEME_ROLES) {
            expect(parseColor(theme[role]), role).toBeInstanceOf(RGBA);
        }
        for (const { code } of MINECRAFT_COLORS) {
            expect(parseColor(theme.chat[code]), code).toBeInstanceOf(RGBA);
        }
    });

    it('keeps the terminal palette in the ANSI theme', () => {
        expect(parseColor(ansiTheme.error).intent).toBe('indexed');
        expect(parseColor(ansiTheme.error).slot).toBe(1);
        expect(parseColor(ansiTheme.chat.c).slot).toBe(9);
    });

    it('uses the Bedrock palette for chat colors in the truecolor theme', () => {
        expect(parseColor(defaultTheme.chat.c).toInts()).toEqual([255, 85, 85, 255]);
        expect(parseColor(defaultTheme.chat['6']).toInts()).toEqual([255, 170, 0, 255]);
    });
});

describe('resolveTheme', () => {
    it('picks the truecolor theme for 24-bit terminals', () => {
        expect(resolveTheme({ noColor: false, colorDepth: 24 })).toBe(defaultTheme);
    });

    it('picks the ANSI theme below 24-bit depth', () => {
        expect(resolveTheme({ noColor: false, colorDepth: 8 })).toBe(ansiTheme);
        expect(resolveTheme({ noColor: false, colorDepth: 4 })).toBe(ansiTheme);
    });

    it('drops color when NO_COLOR is set or the terminal has no color', () => {
        expect(resolveTheme({ noColor: true, colorDepth: 24 })).toBe(monochromeTheme);
        expect(resolveTheme({ noColor: false, colorDepth: 1 })).toBe(monochromeTheme);
    });

    it('maps every foreground role and chat color to the default foreground without color', () => {
        const foreground = RGBA.defaultForeground();
        const background = RGBA.defaultBackground();
        for (const role of THEME_ROLES) {
            const expected =
                role === 'background' || role === 'surface' || role === 'selection' ? background : foreground;
            expect(parseColor(monochromeTheme[role]).equals(expected), role).toBe(true);
        }
        for (const { code } of MINECRAFT_COLORS) {
            expect(parseColor(monochromeTheme.chat[code]).equals(foreground), code).toBe(true);
        }
    });
});
