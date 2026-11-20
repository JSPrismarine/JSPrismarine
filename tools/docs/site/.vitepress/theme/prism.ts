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
 * is shaded. `PrismMark` and the SVG files in `docs/brand/assets/` both draw from this list.
 */
export const facets: readonly Facet[] = [
    { color: 'accent', points: '50,6 50,90 3,90' },
    { color: 'mint', points: '50,6 97,90 50,90' },
    { color: 'signal', points: '50,50 50,90 27.6,90' },
    { color: 'signal', points: '50,50 72.4,90 50,90', shade: 0.18 }
];

/** The facets as SVG polygons with literal colors, for documents that cannot read the `--jsp-*` properties. */
function facetShapes() {
    return facets
        .flatMap(({ color, points, shade }) => [
            `<polygon points="${points}" fill="${palette[color].hex}"/>`,
            ...(shade ? [`<polygon points="${points}" fill="${palette.ink.hex}" fill-opacity="${shade}"/>`] : [])
        ])
        .join('');
}

/** The mark as a standalone SVG document with literal colors, for the footer and the favicon. */
export function prismSvg() {
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">${facetShapes()}</svg>`;
}

/** The smallest box on the grid that holds every facet. */
function markBox() {
    const corners = facets.flatMap(({ points }) =>
        points.split(' ').map((corner) => {
            const [x = Number.NaN, y = Number.NaN] = corner.split(',').map(Number);
            return { x, y };
        })
    );
    const left = Math.min(...corners.map(({ x }) => x));
    const top = Math.min(...corners.map(({ y }) => y));
    return {
        left,
        top,
        width: Math.max(...corners.map(({ x }) => x)) - left,
        height: Math.max(...corners.map(({ y }) => y)) - top
    };
}

/**
 * The mark centered on a square forest tile, for app icons and avatars. The tile gives the mark the
 * brand guide's clear space, half its width on every side, so the mark spans half the tile and also
 * sits inside the safe zone that Android crops a maskable icon to. The tile has square corners,
 * because iOS and Android round an icon themselves.
 */
export function prismTileSvg() {
    const { left, top, width, height } = markBox();
    const side = width * 2;
    const x = left - width / 2;
    const y = top - (side - height) / 2;
    return [
        `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${x} ${y} ${side} ${side}">`,
        `<rect x="${x}" y="${y}" width="${side}" height="${side}" fill="${palette.forest.hex}"/>`,
        facetShapes(),
        '</svg>'
    ].join('');
}
