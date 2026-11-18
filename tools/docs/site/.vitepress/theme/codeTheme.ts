import { TERMINAL_SHADES } from '../../../../../packages/console/src/theme/brand.ts';
import { palette } from './tokens.ts';

const { accent, cream, ink, mint, signal } = palette;
/** Shiki needs literal colors, so the code theme cannot use the `color-mix` shades `brand.css` derives. */
const { text, muted } = TERMINAL_SHADES;

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
