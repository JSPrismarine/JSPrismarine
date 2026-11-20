/**
 * The brand files in `docs/brand/assets/` and the site icons built from them. The code draws the
 * brand files: the mark's geometry from `prism.ts` and its colors from the palette, whose hex values
 * the console reads too. A checked-in SVG as the source would be a second copy of those colors, so
 * `brand:assets` writes the files from the code and `check:brand` fails when the checked-in files no
 * longer match it. Every docs build then rasterizes those files into the favicon, the touch icons
 * and the web app manifest in the site's public folder, which git ignores.
 */

import { readFileSync } from 'node:fs';
import path from 'node:path';
import { Resvg } from '@resvg/resvg-js';
import type { HeadConfig } from 'vitepress';

import { repoRoot } from './project.mts';
import { prismSvg, prismTileSvg, wordmark } from './site/.vitepress/theme/prism.ts';
import { palette } from './site/.vitepress/theme/tokens.ts';

export const brandAssetsDir = path.join(repoRoot, 'docs', 'brand', 'assets');

/** The checked-in brand files, by file name, as the code draws them. */
export function brandAssets(): Record<string, string> {
    return {
        'prism.svg': `${prismSvg()}\n`,
        'prism-tile.svg': `${prismTileSvg()}\n`
    };
}

/** A square PNG of an SVG document, `size` pixels on a side. */
export function renderPng(svg: string, size: number) {
    return new Resvg(svg, { fitTo: { mode: 'width', value: size } }).render().asPng();
}

/**
 * An ICO file that holds each image as a PNG, which every browser that reads ICO accepts. The header
 * and directory are Microsoft's ICONDIR and ICONDIRENTRY layouts, little-endian.
 */
export function icoFile(images: readonly { size: number; png: Uint8Array }[]) {
    const header = Buffer.alloc(6 + 16 * images.length);
    header.writeUInt16LE(0, 0);
    header.writeUInt16LE(1, 2); // 1 is an icon, 2 a cursor.
    header.writeUInt16LE(images.length, 4);
    let offset = header.length;
    images.forEach(({ size, png }, index) => {
        const entry = 6 + 16 * index;
        // A width or height byte of 0 means 256 pixels.
        header.writeUInt8(size % 256, entry);
        header.writeUInt8(size % 256, entry + 1);
        header.writeUInt16LE(1, entry + 4); // Color planes.
        header.writeUInt16LE(32, entry + 6); // Bits per pixel.
        header.writeUInt32LE(png.length, entry + 8);
        header.writeUInt32LE(offset, entry + 12);
        offset += png.length;
    });
    return Buffer.concat([header, ...images.map(({ png }) => png)]);
}

/** The pixel sizes in `favicon.ico`. 48 is the smallest Google Search shows next to a result. */
const faviconSizes = [16, 32, 48];
/** The web app manifest's icons: the bare mark for any use, and the tile for Android to crop. */
const manifestIcons = [
    { src: 'icon-192.png', size: 192, purpose: 'any' },
    { src: 'icon-512.png', size: 512, purpose: 'any' },
    { src: 'icon-maskable-512.png', size: 512, purpose: 'maskable' }
] as const;

/**
 * The site's icon files by name, for the root of its public folder: the favicon as SVG and as ICO,
 * the touch icons and the web app manifest. The bare mark is transparent; the apple-touch icon and the
 * maskable icon use the tile, since iOS fills transparency with black and Android crops to a circle.
 */
export function siteIcons() {
    const read = (name: string) => readFileSync(path.join(brandAssetsDir, name), 'utf8');
    const mark = read('prism.svg');
    const tile = read('prism-tile.svg');
    const files = new Map<string, string | Uint8Array>([
        ['favicon.svg', mark],
        ['favicon.ico', icoFile(faviconSizes.map((size) => ({ size, png: renderPng(mark, size) })))],
        ['apple-touch-icon.png', renderPng(tile, 180)]
    ]);
    for (const { src, size, purpose } of manifestIcons) {
        files.set(src, renderPng(purpose === 'maskable' ? tile : mark, size));
    }
    const manifest = {
        name: wordmark,
        short_name: wordmark,
        // Relative to the manifest, so the site's base path needs no mention.
        start_url: '.',
        display: 'browser',
        theme_color: palette.forest.hex,
        background_color: palette.cream.hex,
        icons: manifestIcons.map(({ src, size, purpose }) => ({
            src,
            sizes: `${size}x${size}`,
            type: 'image/png',
            purpose
        }))
    };
    files.set('site.webmanifest', `${JSON.stringify(manifest, null, 4)}\n`);
    return files;
}

/**
 * The `<head>` tags for the files `siteIcons` writes. The ICO lists its sizes rather than `any`, so a
 * browser that reads SVG favicons picks the SVG.
 *
 * @param base - The site's base path, ending in `/`.
 */
export function siteIconHead(base: string): HeadConfig[] {
    // Google Search takes a PNG favicon only at a multiple of 48 pixels; 192 is one.
    const [pngIcon] = manifestIcons;
    return [
        [
            'link',
            { rel: 'icon', href: `${base}favicon.ico`, sizes: faviconSizes.map((size) => `${size}x${size}`).join(' ') }
        ],
        ['link', { rel: 'icon', type: 'image/svg+xml', href: `${base}favicon.svg` }],
        [
            'link',
            { rel: 'icon', type: 'image/png', sizes: `${pngIcon.size}x${pngIcon.size}`, href: `${base}${pngIcon.src}` }
        ],
        ['link', { rel: 'apple-touch-icon', href: `${base}apple-touch-icon.png` }],
        ['link', { rel: 'manifest', href: `${base}site.webmanifest` }]
    ];
}
