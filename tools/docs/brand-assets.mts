/**
 * The brand files in `docs/brand/assets/`. The code draws them: the mark's geometry from `prism.ts`
 * and its colors from the palette, whose hex values the console reads too. A checked-in SVG as the
 * source would be a second copy of those colors, so `brand:assets` writes the files from the code
 * and `check:brand` fails when the checked-in files no longer match it.
 */

import path from 'node:path';

import { repoRoot } from './project.mts';
import { prismSvg, prismTileSvg } from './site/.vitepress/theme/prism.ts';

export const brandAssetsDir = path.join(repoRoot, 'docs', 'brand', 'assets');

/** The checked-in brand files, by file name, as the code draws them. */
export function brandAssets(): Record<string, string> {
    return {
        'prism.svg': `${prismSvg()}\n`,
        'prism-tile.svg': `${prismTileSvg()}\n`
    };
}
