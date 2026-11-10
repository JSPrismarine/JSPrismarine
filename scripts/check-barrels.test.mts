import fs from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { compare, findBarrels, shrink } from './check-barrels.mts';

let root: string;

beforeEach(() => {
    root = fs.realpathSync(fs.mkdtempSync(path.join(tmpdir(), 'jsp-check-barrels-')));
    // An empty configuration makes the directory its own Biome root, apart from the repository's.
    fs.writeFileSync(path.join(root, 'biome.json'), '{}\n');
    write('src/a.ts', 'export const a = 1;\n');
    write('src/b.ts', 'export const b = 2;\n');
    write('src/index.ts', "export * from './a';\nexport * from './b';\n");
});

afterEach(() => {
    fs.rmSync(root, { recursive: true, force: true });
});

const write = (file: string, contents: string): void => {
    fs.mkdirSync(path.dirname(path.join(root, file)), { recursive: true });
    fs.writeFileSync(path.join(root, file), contents);
};

describe('check-barrels', () => {
    it('counts each rule per file with Biome', () => {
        expect(findBarrels(root)).toEqual({ 'src/index.ts': { noBarrelFile: 1, noReExportAll: 2 } });
    }, 30_000);

    it('passes a baselined barrel and fails a new one', () => {
        const baseline = findBarrels(root);
        expect(compare(findBarrels(root), baseline)).toEqual({ added: [], removed: [] });

        write('src/more.ts', "export { a } from './a';\n");
        write('src/c.ts', "export const c = 3;\nexport * from './b';\n");

        // Biome counts any file with a value re-export as a barrel, even beside its own declarations.
        expect(compare(findBarrels(root), baseline).added).toEqual([
            { file: 'src/c.ts', rule: 'noBarrelFile', allowed: 0, found: 1 },
            { file: 'src/c.ts', rule: 'noReExportAll', allowed: 0, found: 1 },
            { file: 'src/more.ts', rule: 'noBarrelFile', allowed: 0, found: 1 }
        ]);
    }, 30_000);

    it('fails a baselined file that gains an `export *`', () => {
        const baseline = findBarrels(root);
        write('src/c.ts', 'export const c = 3;\n');
        write('src/index.ts', "export * from './a';\nexport * from './b';\nexport * from './c';\n");

        expect(compare(findBarrels(root), baseline).added).toEqual([
            { file: 'src/index.ts', rule: 'noReExportAll', allowed: 2, found: 3 }
        ]);
    }, 30_000);

    it('reports a removed barrel and shrinks the baseline without growing it', () => {
        const baseline = findBarrels(root);
        write('src/index.ts', "export { a } from './a';\nexport { b } from './b';\n");
        const found = findBarrels(root);

        expect(compare(found, baseline)).toEqual({
            added: [],
            removed: [{ file: 'src/index.ts', rule: 'noReExportAll', allowed: 2, found: 0 }]
        });
        expect(shrink(found, baseline)).toEqual({ 'src/index.ts': { noBarrelFile: 1 } });
        expect(shrink({ 'src/other.ts': { noBarrelFile: 1 } }, baseline)).toEqual({});
    }, 30_000);
});
