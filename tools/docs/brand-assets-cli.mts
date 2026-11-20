/** `assets` writes the brand SVG files in `docs/brand/assets/` from the code that draws the mark. */

import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';

import { brandAssets, brandAssetsDir } from './brand-assets.mts';

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
else {
    console.error('Usage: brand-assets-cli.mts assets');
    process.exitCode = 1;
}
