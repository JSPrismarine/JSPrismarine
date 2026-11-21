import { extname } from 'node:path';

import type { UserConfig } from 'vite';
import { describe, expect, it } from 'vitest';

// Loaded by URL: the package's TypeScript project cannot compile the build config, which imports
// the root one by its `.ts` path.
const { default: config }: { default: UserConfig } = await import(new URL('../vite.config.ts', import.meta.url).href);
const entry = config.build?.lib ? config.build.lib.entry : undefined;
const entries: Record<string, string> = typeof entry === 'object' && !Array.isArray(entry) ? entry : {};

describe('the build entries', () => {
    // A JSON entry named like a module replaced that module in `dist`, so the built
    // `java/versions/26.3/configuration.js` exported the raw capture and no `CONFIGURATION` (#3479).
    it('build a module, not the JSON file beside it, under the module name', () => {
        expect(entries['java/versions/26.3/configuration']).toMatch(/configuration\.ts$/);
        expect(entries['java/versions/26.3/blockStates']).toMatch(/blockStates\.ts$/);
        expect(Object.values(entries).filter((file) => extname(file) === '.json')).toEqual([]);
    });
});
