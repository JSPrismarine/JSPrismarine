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
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

import baseline from '../../../scripts/barrel-baseline.json' with { type: 'json' };
import pkg from '../package.json' with { type: 'json' };

/** The package directory. */
const PACKAGE = new URL('../', import.meta.url);

/** The repository root. */
const ROOT = new URL('../../../', import.meta.url);

/**
 * Every `@jsprismarine/prismarine/<path>` the changesets, the guides and the package README tell
 * a consumer to import, as the `./<path>` key the published map would need.
 */
const documentedSubpaths = (): string[] => {
    const markdown = (dir: string): string[] =>
        readdirSync(new URL(dir, ROOT), { recursive: true, encoding: 'utf8' })
            .filter((file) => file.endsWith('.md'))
            .map((file) => readFileSync(new URL(`${dir}/${file}`, ROOT), 'utf8'));
    const pages = [
        ...markdown('.changeset'),
        ...markdown('docs/guide'),
        readFileSync(new URL('README.md', PACKAGE), 'utf8')
    ];
    // A line that says a path is gone, removed or no longer an entry point names it so that a
    // consumer stops importing it, which is the opposite of a promise to resolve it.
    const retired = /\b(gone|removed|no longer)\b/;
    const paths = pages.flatMap((page) =>
        page
            .split('\n')
            .filter((line) => !retired.test(line))
            .flatMap((line) =>
                [...line.matchAll(/@jsprismarine\/prismarine\/([A-Za-z0-9_/.-]+[A-Za-z0-9_])/g)].map(
                    (match) => `./${match[1]}`
                )
            )
    );
    return [...new Set(paths)].sort();
};

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

    // A changeset or guide that names an import path a consumer then cannot resolve is a broken
    // promise: `about` was documented by its changeset and missing from the published map.
    it('publishes every subpath the changesets and guides name', () => {
        const published = new Set(Object.keys(pkg.publishConfig.exports));
        const documented = documentedSubpaths();
        expect(documented).toContain('./about');
        expect(documented.filter((path) => !published.has(path))).toEqual([]);
    });
});
