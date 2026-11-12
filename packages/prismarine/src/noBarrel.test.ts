/**
 * The slice 11 target of the entity and tick re-architecture: no barrel in Prismarine, and an
 * exports map that names modules.
 *
 * `pnpm run lint:barrels` fails when a file fires Biome's `noBarrelFile` or `noReExportAll` more
 * often than `scripts/barrel-baseline.json` allows, so a baseline with no Prismarine entry keeps
 * every barrel and `export *` out of the package. The exports map lists each entry point by the
 * module that defines it, with no pattern that would make every file public again, and the
 * published map is the part of the workspace map a consumer may import.
 */
import { existsSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

import baseline from '../../../scripts/barrel-baseline.json' with { type: 'json' };
import pkg from '../package.json' with { type: 'json' };

/** The package directory. */
const PACKAGE = new URL('../', import.meta.url);

describe('Prismarine', () => {
    it('has no file in the barrel baseline', () => {
        expect(Object.keys(baseline).filter((file) => file.startsWith('packages/prismarine/'))).toEqual([]);
    });

    it('exports no pattern', () => {
        const keys = [...Object.keys(pkg.exports), ...Object.keys(pkg.publishConfig.exports)];
        expect(keys.filter((key) => key.includes('*'))).toEqual([]);
    });

    it('points each workspace entry at a source module that exists', () => {
        const missing = Object.entries(pkg.exports).flatMap(([key, target]) => {
            const source = typeof target === 'string' ? target : target.default;
            return existsSync(new URL(source, PACKAGE)) ? [] : [key];
        });
        expect(missing).toEqual([]);
    });

    it('publishes only workspace entries, each a built module', () => {
        const workspace = new Map<string, unknown>(Object.entries(pkg.exports));
        const unbuilt = Object.entries(pkg.publishConfig.exports).flatMap(([key, target]) => {
            const entry = workspace.get(key);
            if (typeof target === 'string') return entry === target ? [] : [key];
            const dist =
                typeof entry === 'object' && entry !== null && 'jsprismarine:dist' in entry
                    ? entry['jsprismarine:dist']
                    : undefined;
            return dist === target.import ? [] : [key];
        });
        expect(unbuilt).toEqual([]);
        expect(Object.keys(pkg.publishConfig.exports)).toContain('.');
    });
});
