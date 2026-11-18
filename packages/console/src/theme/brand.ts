/**
 * The JSPrismarine brand palette from `docs/brand/README.md`. This is the one place a brand hex
 * value is written: the console's truecolor theme reads it, and the docs site's `tokens.ts` builds
 * the `--jsp-*` properties, the favicon and the brand kit swatches from it.
 */
export const BRAND_PALETTE = {
    accent: '#5ca48a',
    forest: '#003829',
    deep: '#00281d',
    mint: '#a9d9c6',
    cream: '#efe9da',
    ink: '#0b1713',
    signal: '#ff6b3d',
    warning: '#f2c14e'
} as const;

/** A name in {@link BRAND_PALETTE}, such as `accent`. */
export type BrandColor = keyof typeof BRAND_PALETTE;

/**
 * Mixes two hex colors in sRGB, as CSS `color-mix(in srgb, a weight, b)` does, so code that needs
 * literal colors gets the same shades `brand.css` derives with `color-mix`.
 *
 * @param a - The color `weight` applies to, as `#rrggbb`.
 * @param b - The other color, as `#rrggbb`.
 * @param weight - The share of `a`, from 0 to 1.
 */
export function mixHex(a: string, b: string, weight: number): string {
    const channel = (hex: string, index: number) => Number.parseInt(hex.slice(1 + index * 2, 3 + index * 2), 16);
    return `#${[0, 1, 2]
        .map((index) => Math.round(channel(a, index) * weight + channel(b, index) * (1 - weight)))
        .map((value) => value.toString(16).padStart(2, '0'))
        .join('')}`;
}

const { accent, cream, ink, mint } = BRAND_PALETTE;

/**
 * The terminal's derived shades: `--jsp-term-text`, `--jsp-term-bar` and `--jsp-term-muted` in
 * `brand.css`. The docs site's code blocks and the console both draw text on ink with them.
 */
export const TERMINAL_SHADES = {
    text: mixHex(cream, mint, 0.85),
    bar: mixHex(ink, accent, 0.85),
    muted: mixHex(ink, mint, 0.3)
} as const;
