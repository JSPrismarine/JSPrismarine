import { type PaletteColor, palette } from './tokens.ts';

/** One flat facet of the mark: SVG polygon points on a 100 by 100 grid, and its palette color. */
export interface Facet {
    color: PaletteColor;
    points: string;
    /** Ink laid over the facet, from 0 to 1, to shade it without adding a color to the palette. */
    shade?: number;
}

/**
 * The prism mark: a triangle split into an accent and a mint face, with a signal core whose right half
 * is shaded. `PrismMark` and the favicon both draw from this list.
 */
export const facets: readonly Facet[] = [
    { color: 'accent', points: '50,6 50,90 3,90' },
    { color: 'mint', points: '50,6 97,90 50,90' },
    { color: 'signal', points: '50,50 50,90 27.6,90' },
    { color: 'signal', points: '50,50 72.4,90 50,90', shade: 0.18 }
];

/** The mark as a standalone SVG document with literal colors, for the favicon. */
export function prismSvg() {
    const shapes = facets.flatMap(({ color, points, shade }) => [
        `<polygon points="${points}" fill="${palette[color].hex}"/>`,
        ...(shade ? [`<polygon points="${points}" fill="${palette.ink.hex}" fill-opacity="${shade}"/>`] : [])
    ]);
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">${shapes.join('')}</svg>`;
}
