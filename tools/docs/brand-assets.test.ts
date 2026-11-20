import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

import { brandAssets, brandAssetsDir } from './brand-assets.mts';

describe('brand assets', () => {
    it.each(Object.entries(brandAssets()))('checks in %s as the code draws it', (name, contents) => {
        const file = readFileSync(path.join(brandAssetsDir, name), 'utf8');
        expect(file, `Run \`pnpm --filter @jsprismarine/docs run brand:assets\` to rewrite ${name}`).toBe(contents);
    });
});
