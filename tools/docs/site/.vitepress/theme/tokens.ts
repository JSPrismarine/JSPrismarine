/**
 * The brand palette. This is the one place a brand hex value is written: the site config turns it into
 * the `--jsp-*` custom properties and the favicon, and the brand kit page renders its swatches from it.
 */
export const palette = {
    accent: { hex: '#5ca48a', use: 'Primary accent: buttons, highlights, active states.' },
    forest: { hex: '#003829', use: 'Dark brand surface and light-mode link color.' },
    deep: { hex: '#00281d', use: 'Darkest surface: tile backgrounds and shadows.' },
    mint: { hex: '#a9d9c6', use: 'Body text on forest and the light facet of the mark.' },
    cream: { hex: '#efe9da', use: 'Light surface and text on dark.' },
    ink: { hex: '#0b1713', use: 'Text on light and the terminal surface.' },
    signal: { hex: '#ff6b3d', use: 'Spot color for prompts, cursors and the core of the mark.' }
} as const;

/** A name in the palette, such as `accent`. */
export type PaletteColor = keyof typeof palette;

/** The palette as a `:root` rule that defines one `--jsp-<name>` property per color. */
export const paletteCss = `:root{${Object.entries(palette)
    .map(([name, { hex }]) => `--jsp-${name}:${hex}`)
    .join(';')}}`;
