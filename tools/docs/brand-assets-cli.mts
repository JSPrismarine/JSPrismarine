/**
 * `assets` writes the brand SVG files in `docs/brand/assets/` from the code that draws the mark.
 * `site` writes the favicon, touch icons and web app manifest into the site's public folder; the docs
 * build and dev server run it first, so both serve the icons.
 */

import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { brandAssets, brandAssetsDir, siteIcons } from './brand-assets.mts';

const publicDir = path.join(path.dirname(fileURLToPath(import.meta.url)), 'site', 'public');

/** Writes each file into `dir` and lists them. */
function write(dir: string, files: Iterable<[string, string | Uint8Array]>) {
    mkdirSync(dir, { recursive: true });
    const names: string[] = [];
    for (const [name, contents] of files) {
        writeFileSync(path.join(dir, name), contents);
        names.push(name);
    }
    console.log(`Wrote ${names.join(', ')} to ${path.relative(process.cwd(), dir) || '.'}.`);
}

const target = process.argv[2];
if (target === 'assets') write(brandAssetsDir, Object.entries(brandAssets()));
else if (target === 'site') write(publicDir, siteIcons());
else {
    console.error('Usage: brand-assets-cli.mts assets|site');
    process.exitCode = 1;
}
