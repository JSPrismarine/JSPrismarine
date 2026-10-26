import { LOG_LEVELS } from '@jsprismarine/logger';
import type { ColorInput } from '@opentui/core';
import { RGBA } from '@opentui/core';
import type { AnsiColorName, ChatPalette } from './minecraftColors';
import { ANSI_COLOR_NAMES, chatPaletteFrom } from './minecraftColors';

/**
 * Log levels the console colors, in the logger's severity order. Supervisor notices render as
 * status segments and toasts, never as log lines, so there is no level role for them.
 */
export const LEVEL_ROLES = LOG_LEVELS;

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
    'errorBackground',
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
    background: '#171d20',
    surface: '#202a30',
    border: '#3a4a50',
    borderFocused: '#d9955c',
    errorBackground: '#2b2023',
    text: '#e7e1d7',
    textMuted: '#8a9794',
    accent: '#70bdb3',
    prompt: '#d9955c',
    selection: '#28343a',
    error: '#d06d69',
    warn: '#e0b570',
    info: '#e7e1d7',
    verbose: '#74acb1',
    debug: '#ac9abd',
    silly: '#ac9abd',
    ok: '#70bdb3',
    warning: '#e0b570',
    danger: '#d06d69',
    muted: '#8a9794',
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
    errorBackground: ansiColor('black'),
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
        errorBackground: background,
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
