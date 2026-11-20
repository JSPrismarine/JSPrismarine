import { BRAND_PALETTE } from '../../../../../packages/console/src/theme/brand.ts';

/**
 * The brand palette with the use of each color. The hex values come from the console package's
 * `BRAND_PALETTE`, which the console themes itself from too. The site config turns them into the
 * `--jsp-*` custom properties, `prism.ts` colors the mark's files and the favicon with them, and the
 * brand kit page renders its swatches from them.
 */
export const palette = {
    accent: { hex: BRAND_PALETTE.accent, use: 'Primary accent: buttons, highlights, active states.' },
    forest: { hex: BRAND_PALETTE.forest, use: 'Dark brand surface and light-mode link color.' },
    deep: { hex: BRAND_PALETTE.deep, use: 'Darkest surface: tile backgrounds and shadows.' },
    mint: { hex: BRAND_PALETTE.mint, use: 'Body text on forest and the light facet of the mark.' },
    cream: { hex: BRAND_PALETTE.cream, use: 'Light surface and text on dark.' },
    ink: { hex: BRAND_PALETTE.ink, use: 'Text on light and the terminal surface.' },
    signal: { hex: BRAND_PALETTE.signal, use: 'Spot color for prompts, cursors and the core of the mark.' },
    warning: { hex: BRAND_PALETTE.warning, use: 'Spot color for warnings and for states still in progress.' }
} as const;

/** A name in the palette, such as `accent`. */
export type PaletteColor = keyof typeof palette;

/** The palette as a `:root` rule that defines one `--jsp-<name>` property per color. */
export const paletteCss = `:root{${Object.entries(palette)
    .map(([name, { hex }]) => `--jsp-${name}:${hex}`)
    .join(';')}}`;
