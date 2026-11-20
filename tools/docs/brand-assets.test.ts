import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { Resvg } from '@resvg/resvg-js';
import { describe, expect, it } from 'vitest';

import { brandAssets, brandAssetsDir, icoFile, renderPng, siteIconHead, siteIcons } from './brand-assets.mts';
import { repoRoot } from './project.mts';
import { prismTileSvg, wordmark } from './site/.vitepress/theme/prism.ts';
import { palette } from './site/.vitepress/theme/tokens.ts';

/** The width and height a PNG's IHDR chunk records. */
function pngSize(png: Uint8Array) {
    const view = Buffer.from(png);
    expect(view.subarray(1, 4).toString('latin1')).toBe('PNG');
    return { width: view.readUInt32BE(16), height: view.readUInt32BE(20) };
}

/** A PNG decoded to RGBA rows, by drawing it into an SVG of its own size. */
function decode(png: Uint8Array) {
    const { width, height } = pngSize(png);
    const href = `data:image/png;base64,${Buffer.from(png).toString('base64')}`;
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}"><image href="${href}" width="${width}" height="${height}"/></svg>`;
    const pixels = new Resvg(svg).render().pixels;
    const at = (x: number, y: number) => [...pixels.subarray((y * width + x) * 4, (y * width + x) * 4 + 4)];
    return { width, height, at };
}

const hexRgb = (hex: string) => [1, 3, 5].map((index) => Number.parseInt(hex.slice(index, index + 2), 16));

describe('brand assets', () => {
    it.each(Object.entries(brandAssets()))('checks in %s as the code draws it', (name, contents) => {
        const file = readFileSync(path.join(brandAssetsDir, name), 'utf8');
        expect(file, `Run \`pnpm --filter @jsprismarine/docs run brand:assets\` to rewrite ${name}`).toBe(contents);
    });

    it('centers the mark on the tile with half its width clear on every side', () => {
        const size = 376;
        const { at } = decode(renderPng(prismTileSvg(), size));
        const forest = [...hexRgb(palette.forest.hex), 255];
        const columns: number[] = [];
        const rows: number[] = [];
        for (let y = 0; y < size; y++) {
            for (let x = 0; x < size; x++) {
                if (at(x, y).some((channel, index) => Math.abs(channel - (forest[index] ?? 0)) > 8)) {
                    columns.push(x);
                    rows.push(y);
                }
            }
        }
        const left = Math.min(...columns);
        const right = Math.max(...columns) + 1;
        const top = Math.min(...rows);
        const bottom = Math.max(...rows) + 1;
        expect(right - left).toBeCloseTo(size / 2, -1);
        expect(left).toBeCloseTo(size - right, -1);
        expect(top).toBeCloseTo(size - bottom, -1);
    });
});

describe('icoFile', () => {
    it('lists each PNG in the directory with its size, length and offset', () => {
        const images = [16, 32, 256].map((size) => ({ size, png: renderPng(prismTileSvg(), size) }));
        const ico = icoFile(images);
        expect(ico.readUInt16LE(0)).toBe(0);
        expect(ico.readUInt16LE(2)).toBe(1);
        expect(ico.readUInt16LE(4)).toBe(images.length);
        images.forEach(({ size, png }, index) => {
            const entry = 6 + 16 * index;
            // 256 pixels is written as 0.
            expect(ico.readUInt8(entry) || 256).toBe(size);
            expect(ico.readUInt8(entry + 1) || 256).toBe(size);
            const length = ico.readUInt32LE(entry + 8);
            const offset = ico.readUInt32LE(entry + 12);
            expect(Buffer.compare(ico.subarray(offset, offset + length), png)).toBe(0);
            expect(pngSize(ico.subarray(offset, offset + length))).toEqual({ width: size, height: size });
        });
    });
});

describe('siteIcons', () => {
    const files = siteIcons();
    const png = (name: string) => {
        const file = files.get(name);
        if (typeof file !== 'object') throw new TypeError(`siteIcons wrote no ${name}`);
        return file;
    };

    it('puts 16, 32 and 48 pixel images in favicon.ico', () => {
        const ico = Buffer.from(png('favicon.ico'));
        const sizes = Array.from({ length: ico.readUInt16LE(4) }, (_, index) => ico.readUInt8(6 + 16 * index));
        expect(sizes).toEqual([16, 32, 48]);
    });

    it('serves the checked-in mark as the SVG favicon', () => {
        expect(files.get('favicon.svg')).toBe(brandAssets()['prism.svg']);
    });

    it('gives iOS an opaque 180 pixel touch icon', () => {
        const icon = decode(png('apple-touch-icon.png'));
        expect([icon.width, icon.height]).toEqual([180, 180]);
        for (const [x, y] of [
            [0, 0],
            [179, 0],
            [0, 179],
            [179, 179]
        ] as const) {
            expect(icon.at(x, y)).toEqual([...hexRgb(palette.forest.hex), 255]);
        }
    });

    it('keeps the bare mark transparent around it', () => {
        expect(decode(png('icon-192.png')).at(0, 0)[3]).toBe(0);
    });

    it('builds the manifest from the palette and lists icons it wrote at their sizes', () => {
        const manifest = JSON.parse(String(files.get('site.webmanifest')));
        expect(manifest).toMatchObject({
            name: wordmark,
            theme_color: palette.forest.hex,
            background_color: palette.cream.hex
        });
        for (const { src, sizes, purpose } of manifest.icons) {
            const { width, height } = pngSize(png(src));
            expect(`${width}x${height}`).toBe(sizes);
            if (purpose === 'maskable') expect(decode(png(src)).at(0, 0)[3]).toBe(255);
        }
        expect(manifest.icons.map(({ purpose }: { purpose: string }) => purpose)).toContain('maskable');
    });

    it('links every icon in the head to a file it wrote', () => {
        const hrefs = siteIconHead('/docs/').map(([, attributes]) => attributes?.href);
        for (const href of hrefs) {
            expect(href?.startsWith('/docs/')).toBe(true);
            expect(files.has(href?.slice('/docs/'.length) ?? '')).toBe(true);
        }
    });

    it('writes only files git ignores', () => {
        const publicPaths = [...files.keys()].map((name) => path.join('tools', 'docs', 'site', 'public', name));
        const ignored = execFileSync('git', ['check-ignore', '--no-index', ...publicPaths], {
            cwd: repoRoot,
            encoding: 'utf8'
        });
        expect(ignored.trim().split('\n').sort()).toEqual([...publicPaths].sort());
    });
});
