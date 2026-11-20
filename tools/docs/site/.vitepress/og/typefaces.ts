import { readFileSync } from 'node:fs';

import { type FontMetrics, readFontMetrics } from './fontMetrics.ts';

/** One font file a card draws with: its family name for satori, its weight and its metrics. */
export interface Typeface {
    family: string;
    weight: 500 | 800 | 400 | 700;
    /** The WOFF file, which satori reads directly. It cannot read WOFF2. */
    data: Buffer;
    metrics: FontMetrics;
}

function typeface(family: string, weight: Typeface['weight'], file: string): Typeface {
    const data = readFileSync(new URL(`./fonts/${file}`, import.meta.url));
    return { family, weight, data, metrics: readFontMetrics(data) };
}

/**
 * The brand's two typefaces as static instances. Bricolage Grotesque ships two optical sizes as
 * separate families, because satori cannot set the `opsz` axis: titles get the 96pt cut the site's
 * headlines use, and labels and body text the 32pt cut.
 */
export const typefaces = {
    display: typeface('Display', 800, 'bricolage-grotesque-800-opsz96.woff'),
    heading: typeface('Text', 800, 'bricolage-grotesque-800-opsz32.woff'),
    body: typeface('Text', 500, 'bricolage-grotesque-500-opsz32.woff'),
    mono: typeface('Mono', 400, 'jetbrains-mono-400.woff'),
    monoBold: typeface('Mono', 700, 'jetbrains-mono-700.woff')
};

/** The fonts in the form satori takes them. */
export const satoriFonts = Object.values(typefaces).map(({ family, weight, data }) => ({
    name: family,
    data,
    weight,
    style: 'normal' as const
}));

/**
 * The first card font with a glyph for a character, which satori draws it from when the font a run
 * asks for lacks it. Undefined for a character none of them has, which satori would draw as a box.
 */
export const fallbackFace = (codePoint: number) =>
    Object.values(typefaces).find(({ metrics }) => metrics.covers(codePoint));

/**
 * Text with the characters no card font has left out, and those characters. Satori would draw each of
 * them as an empty box: an emoji, a CJK character or a symbol such as `✓`.
 */
export function drawableText(text: string) {
    const missing = [...text].filter((character) => !fallbackFace(character.codePointAt(0) ?? 0));
    if (!missing.length) return { text, missing };
    const kept = [...text].filter((character) => !missing.includes(character)).join('');
    return { text: kept.replace(/\s{2,}/g, ' ').trim(), missing: [...new Set(missing)] };
}
