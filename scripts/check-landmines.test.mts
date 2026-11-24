import fs from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { enabledRules, findLandmines } from './check-landmines.mts';
import { compareCounts } from './rule-baseline.mts';

let root: string;

const write = (file: string, contents: string): void => {
    fs.mkdirSync(path.dirname(path.join(root, file)), { recursive: true });
    fs.writeFileSync(path.join(root, file), contents);
};

beforeEach(() => {
    root = fs.realpathSync(fs.mkdtempSync(path.join(tmpdir(), 'jsp-check-landmines-')));
    // The temporary directory has no node_modules, so point Oxlint at the installed plugin by path.
    const require = createRequire(import.meta.url);
    write(
        '.oxlintrc.json',
        JSON.stringify({
            plugins: [],
            categories: { correctness: 'off' },
            jsPlugins: [{ name: 'landmines', specifier: require.resolve('@interfere/landmines') }],
            rules: {
                'landmines/no-flake-masking': 'error',
                'landmines/package-exports': ['error'],
                'landmines/test-file-names': 'off'
            }
        })
    );
    write('pkg/package.json', JSON.stringify({ name: 'pkg', type: 'module', exports: { './*': './src/*.ts' } }));
    write('pkg/src/a.ts', 'export const a = 1;\n');
    write('pkg/src/b.ts', 'export const b = 2;\n');
});

afterEach(() => {
    fs.rmSync(root, { recursive: true, force: true });
});

describe('check-landmines', () => {
    it('reads the rules the configuration turns on', () => {
        expect(enabledRules(root)).toEqual(['landmines/no-flake-masking', 'landmines/package-exports']);
    });

    it('counts package-exports once per package, so a new file in that package passes', () => {
        const baseline = findLandmines(root);
        expect(baseline).toEqual({ 'pkg/package.json': { 'landmines/package-exports': 1 } });

        write('pkg/src/c.ts', 'export const c = 3;\n');
        expect(compareCounts(enabledRules(root), findLandmines(root), baseline)).toEqual({ added: [], removed: [] });
    });

    it('counts package-exports against a package at the checked directory', () => {
        write('package.json', JSON.stringify({ name: 'root', type: 'module', exports: { './*': './src/*.ts' } }));
        write('src/a.ts', 'export const a = 1;\n');
        write('src/b.ts', 'export const b = 2;\n');

        expect(findLandmines(root)['package.json']).toEqual({ 'landmines/package-exports': 1 });
        expect(Object.keys(findLandmines(root)).filter((file) => file.startsWith('src/'))).toEqual([]);
    });

    it('fails a file that adds a finding the baseline does not allow', () => {
        const baseline = findLandmines(root);
        write(
            'pkg/src/a.test.ts',
            "import { expect, it } from 'vitest';\nimport { a } from './a.ts';\nit('is one', { retry: 2 }, () => {\n    expect(a).toBe(1);\n});\n"
        );

        expect(compareCounts(enabledRules(root), findLandmines(root), baseline).added).toEqual([
            { file: 'pkg/src/a.test.ts', rule: 'landmines/no-flake-masking', allowed: 0, found: 1 }
        ]);
    });
});
