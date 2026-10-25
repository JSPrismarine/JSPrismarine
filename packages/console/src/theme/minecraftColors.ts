import type { ColorInput } from '@opentui/core';
import { TextAttributes } from '@opentui/core';

/**
 * Names of the 16 ANSI palette entries, in palette order.
 */
export const ANSI_COLOR_NAMES = [
    'black',
    'red',
    'green',
    'yellow',
    'blue',
    'magenta',
    'cyan',
    'white',
    'brightBlack',
    'brightRed',
    'brightGreen',
    'brightYellow',
    'brightBlue',
    'brightMagenta',
    'brightCyan',
    'brightWhite'
] as const;

/** One of `ANSI_COLOR_NAMES`. */
export type AnsiColorName = (typeof ANSI_COLOR_NAMES)[number];

/**
 * Minecraft `§` color codes with their Bedrock palette value and the ANSI
 * palette entry that stands in for it on 16-color terminals.
 *
 * Hex values follow the Bedrock table at https://minecraft.wiki/w/Formatting_codes.
 * The ANSI column matches the escapes `@jsprismarine/color-parser` writes to
 * stdout, so the TUI and the plain console agree on 16-color terminals.
 * `@jsprismarine/color-parser` is not the source of truth here because it only
 * exports escape strings, and recovering a palette index from `\u001b[91m`
 * would mean parsing ANSI.
 */
export const MINECRAFT_COLORS = [
    { code: '0', name: 'black', hex: '#000000', ansi: 'black' },
    { code: '1', name: 'darkBlue', hex: '#0000aa', ansi: 'blue' },
    { code: '2', name: 'darkGreen', hex: '#00aa00', ansi: 'green' },
    { code: '3', name: 'darkAqua', hex: '#00aaaa', ansi: 'cyan' },
    { code: '4', name: 'darkRed', hex: '#aa0000', ansi: 'red' },
    { code: '5', name: 'darkPurple', hex: '#aa00aa', ansi: 'magenta' },
    { code: '6', name: 'gold', hex: '#ffaa00', ansi: 'yellow' },
    { code: '7', name: 'gray', hex: '#aaaaaa', ansi: 'white' },
    { code: '8', name: 'darkGray', hex: '#555555', ansi: 'brightBlack' },
    { code: '9', name: 'blue', hex: '#5555ff', ansi: 'brightBlue' },
    { code: 'a', name: 'green', hex: '#55ff55', ansi: 'brightGreen' },
    { code: 'b', name: 'aqua', hex: '#55ffff', ansi: 'brightCyan' },
    { code: 'c', name: 'red', hex: '#ff5555', ansi: 'brightRed' },
    { code: 'd', name: 'lightPurple', hex: '#ff55ff', ansi: 'brightMagenta' },
    { code: 'e', name: 'yellow', hex: '#ffff55', ansi: 'brightYellow' },
    { code: 'f', name: 'white', hex: '#ffffff', ansi: 'brightWhite' }
] as const satisfies readonly { code: string; name: string; hex: `#${string}`; ansi: AnsiColorName }[];

/** One entry of `MINECRAFT_COLORS`. */
export type MinecraftColor = (typeof MINECRAFT_COLORS)[number];

/** The character after `§` that selects a color. */
export type MinecraftColorCode = MinecraftColor['code'];

/**
 * Color input for every Minecraft color code, as a theme provides it.
 */
export type ChatPalette = Readonly<Record<MinecraftColorCode, ColorInput>>;

/**
 * Minecraft `§` format codes and the text attribute each one sets.
 *
 * `k` (obfuscated) has no terminal equivalent and sets no attribute. Bedrock
 * reads `§m` and `§n` as material colors, but the server's console parser
 * treats them as strikethrough and underline like Java Edition, and this
 * table follows the server so the TUI shows what the plain console shows.
 */
export const MINECRAFT_FORMATS = {
    l: TextAttributes.BOLD,
    o: TextAttributes.ITALIC,
    n: TextAttributes.UNDERLINE,
    m: TextAttributes.STRIKETHROUGH,
    k: TextAttributes.NONE
} as const satisfies Record<string, number>;

/** The character after `§` that sets a format. */
export type MinecraftFormatCode = keyof typeof MINECRAFT_FORMATS;

/** The `§` code that clears color and formatting. */
export const MINECRAFT_RESET_CODE = 'r';

const colorCodes: ReadonlySet<string> = new Set(MINECRAFT_COLORS.map(({ code }) => code));

/**
 * Whether a character following `§` selects a color.
 */
export function isMinecraftColorCode(code: string): code is MinecraftColorCode {
    return colorCodes.has(code);
}

/**
 * Whether a character following `§` sets a format.
 */
export function isMinecraftFormatCode(code: string): code is MinecraftFormatCode {
    return Object.hasOwn(MINECRAFT_FORMATS, code);
}

/**
 * Builds a chat palette by choosing a color input for each Minecraft color.
 *
 * Themes use this to pick the hex value, the ANSI palette entry, or a fixed
 * color for every code at once.
 */
export function chatPaletteFrom(pick: (color: MinecraftColor) => ColorInput): ChatPalette {
    const palette: Partial<Record<MinecraftColorCode, ColorInput>> = {};
    for (const color of MINECRAFT_COLORS) {
        palette[color.code] = pick(color);
    }
    // Every code was assigned in the loop; TypeScript cannot see that a Partial filled by iteration is complete.
    return palette as ChatPalette;
}
