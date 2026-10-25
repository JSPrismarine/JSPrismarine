import type { ColorInput } from '@opentui/core';
import { RGBA } from '@opentui/core';
import type { AnsiColorName, ChatPalette } from './minecraftColors';
import { ANSI_COLOR_NAMES, chatPaletteFrom } from './minecraftColors';

/**
 * Log levels the console colors, in severity order. The first six are the
 * logger's levels; `dev` marks notices from the dev supervisor.
 */
export const LEVEL_ROLES = ['error', 'warn', 'info', 'verbose', 'debug', 'silly', 'dev'] as const;

/** One of `LEVEL_ROLES`. */
export type LevelRole = (typeof LEVEL_ROLES)[number];

/**
 * Every color role the console reads from a theme: chrome, levels, and status tones.
 */
export const THEME_ROLES = [
    'background',
    'surface',
    'border',
    'borderFocused',
    'text',
    'textMuted',
    'accent',
    'prompt',
    'selection',
    ...LEVEL_ROLES,
    'ok',
    'warning',
    'danger',
    'muted'
] as const;

/** One of `THEME_ROLES`. */
export type ThemeRole = (typeof THEME_ROLES)[number];

/**
 * Colors for the console, keyed by role, plus the palette for `§` chat colors.
 *
 * Every value is an input `parseColor` accepts. Components read roles instead
 * of literal colors so one resolved theme covers truecolor, 16-color, and
 * `NO_COLOR` terminals.
 */
export interface Theme extends Readonly<Record<ThemeRole, ColorInput>> {
    /** Color for each Minecraft `§` color code. */
    readonly chat: ChatPalette;
}

/**
 * Returns the named ANSI palette entry with its index preserved, so the
 * terminal's own palette shows through instead of a truecolor approximation.
 */
export function ansiColor(name: AnsiColorName): RGBA {
    return RGBA.fromIndex(ANSI_COLOR_NAMES.indexOf(name));
}

/**
 * Truecolor theme for dark terminals. Only level tokens, the namespace, and
 * status tones carry color; message text stays in the terminal's foreground.
 */
export const defaultTheme: Theme = {
    background: RGBA.defaultBackground(),
    surface: '#262a33',
    border: '#3b4252',
    borderFocused: '#81a1c1',
    text: RGBA.defaultForeground(),
    textMuted: '#6c7383',
    accent: '#88c0d0',
    prompt: '#a3be8c',
    selection: '#3b4a66',
    error: '#bf616a',
    warn: '#ebcb8b',
    info: '#d8dee9',
    verbose: '#8fbcbb',
    debug: '#7b8394',
    silly: '#b48ead',
    dev: '#6c7383',
    ok: '#a3be8c',
    warning: '#ebcb8b',
    danger: '#bf616a',
    muted: '#6c7383',
    chat: chatPaletteFrom(({ hex }) => hex)
};

/**
 * 16-color theme. Level colors match the escapes the plain console writes.
 */
export const ansiTheme: Theme = {
    background: RGBA.defaultBackground(),
    surface: ansiColor('black'),
    border: ansiColor('brightBlack'),
    borderFocused: ansiColor('cyan'),
    text: RGBA.defaultForeground(),
    textMuted: ansiColor('brightBlack'),
    accent: ansiColor('cyan'),
    prompt: ansiColor('green'),
    selection: ansiColor('blue'),
    error: ansiColor('red'),
    warn: ansiColor('yellow'),
    info: ansiColor('white'),
    verbose: ansiColor('cyan'),
    debug: ansiColor('brightBlack'),
    silly: ansiColor('magenta'),
    dev: ansiColor('brightBlack'),
    ok: ansiColor('green'),
    warning: ansiColor('yellow'),
    danger: ansiColor('red'),
    muted: ansiColor('brightBlack'),
    chat: chatPaletteFrom(({ ansi }) => ansiColor(ansi))
};

/**
 * Theme for `NO_COLOR` and monochrome terminals. Foreground roles and chat
 * colors are the default foreground; `background`, `surface`, and `selection`
 * are the default background so text painted over them stays visible. Use
 * text attributes (bold, dim, inverse) for emphasis with this theme.
 */
export const monochromeTheme: Theme = (() => {
    const foreground = RGBA.defaultForeground();
    const background = RGBA.defaultBackground();
    return {
        background,
        surface: background,
        border: foreground,
        borderFocused: foreground,
        text: foreground,
        textMuted: foreground,
        accent: foreground,
        prompt: foreground,
        selection: background,
        error: foreground,
        warn: foreground,
        info: foreground,
        verbose: foreground,
        debug: foreground,
        silly: foreground,
        dev: foreground,
        ok: foreground,
        warning: foreground,
        danger: foreground,
        muted: foreground,
        chat: chatPaletteFrom(() => foreground)
    };
})();

/** Terminal facts that decide which theme to use. */
export interface ResolveThemeOptions {
    /** True when `NO_COLOR` is set to a non-empty value. */
    noColor: boolean;
    /** Bits per color as `tty.WriteStream#getColorDepth()` reports: 1, 4, 8, or 24. */
    colorDepth: number;
}

/**
 * Chooses the theme for a terminal: monochrome when `NO_COLOR` is set or the
 * terminal reports no color, the 16-color theme below 24-bit depth, and the
 * truecolor theme otherwise.
 */
export function resolveTheme({ noColor, colorDepth }: ResolveThemeOptions): Theme {
    if (noColor || colorDepth <= 1) return monochromeTheme;
    if (colorDepth < 24) return ansiTheme;
    return defaultTheme;
}
