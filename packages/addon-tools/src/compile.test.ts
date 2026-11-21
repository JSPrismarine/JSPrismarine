import { mkdir, readFile, rm, symlink, writeFile } from 'node:fs/promises';
import path from 'node:path';

import { AddonToolsErrors } from '@jsprismarine/errors/addon-tools';
import { describe, expect, it } from 'vitest';

import { readAddon } from './addon';
import { compileAddon } from './compile';
import { copyHello, temporaryDirectory } from './fixture.test-utils';

/** A project as a TypeScript addon has one, without the script typings an addon's would name. */
const TSCONFIG = {
    compilerOptions: {
        target: 'ES2022',
        lib: ['ES2022'],
        module: 'ESNext',
        moduleResolution: 'Bundler',
        allowImportingTsExtensions: true,
        rewriteRelativeImportExtensions: true,
        strict: true,
        noEmitOnError: true,
        sourceMap: true,
        types: [],
        rootDir: 'src',
        outDir: 'scripts'
    },
    include: ['src']
};

/**
 * A copy of the `hello` fixture written in TypeScript: its script's source under `src/`, the project
 * that builds it, a package manifest and a `node_modules/` with a link, and no `scripts/` yet.
 */
const typescriptHello = async (main: string): Promise<string> => {
    const { addon } = await copyHello();
    await rm(path.join(addon, 'scripts'), { recursive: true });
    await mkdir(path.join(addon, 'src'));
    await writeFile(path.join(addon, 'src', 'main.ts'), main);
    await writeFile(path.join(addon, 'src', 'greeting.ts'), "export const greeting: string = 'Hello';\n");
    await writeFile(path.join(addon, 'tsconfig.json'), JSON.stringify(TSCONFIG));
    await writeFile(path.join(addon, 'package.json'), JSON.stringify({ name: 'hello', private: true }));
    await mkdir(path.join(addon, 'node_modules'));
    await symlink(await temporaryDirectory(), path.join(addon, 'node_modules', 'linked'));
    return addon;
};

describe('compileAddon', () => {
    it('builds the scripts, and the pack holds them without the project, its sources or the maps', async () => {
        const addon = await typescriptHello(
            "import { greeting } from './greeting.ts';\n\nexport const message: string = greeting + ', world';\n"
        );

        await expect(compileAddon(addon)).resolves.toBe(true);

        expect(await readFile(path.join(addon, 'scripts', 'main.js'), 'utf8')).toContain("from './greeting.js'");
        expect([...(await readAddon(addon)).files.keys()]).toEqual([
            'README.md',
            'addon.json',
            'manifest.json',
            'scripts/greeting.js',
            'scripts/main.js'
        ]);
    });

    it('writes the scripts to another folder when asked', async () => {
        const addon = await typescriptHello("export const message: string = 'Hello';\n");
        const out = await temporaryDirectory();

        await compileAddon(addon, { outDirectory: out });

        expect(await readFile(path.join(out, 'main.js'), 'utf8')).toContain("export const message = 'Hello';");
        await expect(readFile(path.join(addon, 'scripts', 'main.js'))).rejects.toMatchObject({ code: 'ENOENT' });
    });

    it("refuses an addon whose scripts do not compile, with the compiler's message", async () => {
        const addon = await typescriptHello('export const count: number = "three";\n');

        const failure = compileAddon(addon);

        await expect(failure).rejects.toBeInstanceOf(AddonToolsErrors.AddonCompileFailed);
        await expect(failure).rejects.toThrow(/TS2322/);
    });

    it('leaves an addon without a tsconfig.json as it is', async () => {
        const { addon } = await copyHello();

        await expect(compileAddon(addon)).resolves.toBe(false);
        expect([...(await readAddon(addon)).files.keys()]).toContain('scripts/main.js');
    });
});
