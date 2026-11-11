import { palette } from './tokens.ts';

/**
 * Mixes two palette hex colors in sRGB, as CSS `color-mix(in srgb, a weight, b)` does. Shiki needs literal
 * colors, so the code theme cannot use the `color-mix` shades `brand.css` derives.
 */
function mix(a: string, b: string, weight: number) {
    const channel = (hex: string, index: number) => Number.parseInt(hex.slice(1 + index * 2, 3 + index * 2), 16);
    return `#${[0, 1, 2]
        .map((index) => Math.round(channel(a, index) * weight + channel(b, index) * (1 - weight)))
        .map((value) => value.toString(16).padStart(2, '0'))
        .join('')}`;
}

const { accent, cream, ink, mint, signal } = palette;
/** The same shades as `--jsp-term-text` and `--jsp-term-muted` in `brand.css`. */
const text = mix(cream.hex, mint.hex, 0.85);
const muted = mix(ink.hex, mint.hex, 0.3);

/**
 * The syntax theme for code blocks: the terminal's ink surface and brand colors, in both color modes.
 * Every token color is at least 6:1 against ink.
 */
export const codeTheme = {
    name: 'jsprismarine',
    type: 'dark' as const,
    colors: { 'editor.background': ink.hex, 'editor.foreground': text },
    tokenColors: [
        { settings: { foreground: text } },
        { scope: ['comment', 'punctuation.definition.comment'], settings: { foreground: muted } },
        {
            scope: ['keyword', 'storage', 'keyword.operator.new', 'keyword.operator.expression', 'variable.language'],
            settings: { foreground: accent.hex }
        },
        { scope: ['string', 'markup.inline.raw', 'string.other.link'], settings: { foreground: mint.hex } },
        {
            scope: ['constant.numeric', 'constant.language', 'constant.character.escape', 'support.constant'],
            settings: { foreground: signal.hex }
        },
        {
            scope: ['entity.name.function', 'support.function', 'entity.name.command', 'meta.function-call'],
            settings: { foreground: cream.hex }
        },
        {
            scope: ['entity.name.type', 'entity.name.class', 'support.type', 'support.class', 'entity.name.tag'],
            settings: { foreground: cream.hex, fontStyle: 'bold' }
        },
        { scope: ['support.type.property-name', 'entity.other.attribute-name'], settings: { foreground: accent.hex } },
        { scope: ['markup.heading', 'markup.bold'], settings: { foreground: cream.hex, fontStyle: 'bold' } },
        { scope: ['markup.deleted'], settings: { foreground: signal.hex } },
        { scope: ['markup.inserted'], settings: { foreground: accent.hex } }
    ]
};
