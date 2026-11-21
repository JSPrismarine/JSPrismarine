import { readFileSync } from 'node:fs';
import { dirname, join, relative, resolve, sep } from 'node:path';

import { describe, expect, it } from 'vitest';

import { NATIVE_PACKAGES, repoRoot } from './packages.mts';

/** Every module specifier a file imports or re-exports. */
const specifiersOf = (file: string): string[] =>
    [...readFileSync(file, 'utf8').matchAll(/^(?:import|export)\b[^;]*?\bfrom\s+'([^']+)'/gms)].map(
        (match) => match[1] ?? ''
    );

/**
 * The files a module loads, following relative imports, and the bare specifiers it reaches. The
 * workflows run `build:native` with plain `node` and no dependencies installed, so a bare
 * specifier other than a `node:` built-in cannot resolve there.
 */
const importGraph = (entry: string): { files: Set<string>; packages: Set<string> } => {
    const files = new Set<string>();
    const packages = new Set<string>();
    const visit = (file: string): void => {
        if (files.has(file)) return;
        files.add(file);
        for (const specifier of specifiersOf(file)) {
            if (specifier.startsWith('.')) visit(resolve(dirname(file), specifier));
            else if (!specifier.startsWith('node:')) packages.add(specifier);
        }
    };
    visit(entry);
    return { files, packages };
};

describe.each(Object.entries(NATIVE_PACKAGES))('the %s native build', (_id, pkg) => {
    const packageDir = join(repoRoot, pkg.dir);
    const graph = importGraph(join(packageDir, 'scripts', 'build-native.mts'));

    it('loads with no dependencies installed', () => {
        expect([...graph.packages]).toEqual([]);
    });

    it('hashes every file it reads outside native/', () => {
        const read = [...graph.files].map((file) => relative(packageDir, file).split(sep).join('/'));
        expect(pkg.buildScripts).toEqual(expect.arrayContaining(read));
    });
});
