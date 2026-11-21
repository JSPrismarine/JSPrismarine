/**
 * JSPrismarine's own addons under `addons/` as packs a test runs: each one's scripts compiled from
 * its TypeScript sources, and a copy of one as Bedrock Dedicated Server runs it, without
 * `@jsprismarine/server`.
 */
import { cpSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { ADDON_SOURCE_ENTRIES, compileAddon } from '@jsprismarine/addon-tools/compile';

import type { ScriptPack } from '../host/pack';
import { readScriptPack } from '../host/pack';

/** The folder of each addon's build, by name. Test files share a worker's modules, so one build serves them all. */
const built = new Map<string, Promise<string>>();
/** The build folders, removed when the worker exits. */
const directories: string[] = [];
process.once('exit', () => {
    for (const directory of directories) rmSync(directory, { recursive: true, force: true });
});

/** What the copy of an addon leaves out: the project that builds its scripts, and the scripts a build left there. */
const SKIPPED: readonly string[] = [...ADDON_SOURCE_ENTRIES, 'scripts'];

/**
 * An addon of this repository as its pack holds it: its files, and its scripts compiled from
 * `src/`. The build goes into a folder of its own rather than the addon's `scripts/`, so test files
 * that run at once never read a script another one is writing.
 */
export const addonDirectory = (name: string): Promise<string> => {
    let directory = built.get(name);
    if (directory === undefined) {
        directory = (async () => {
            const source = fileURLToPath(new URL(`../../../../addons/${name}`, import.meta.url));
            const target = mkdtempSync(join(tmpdir(), `jsp-addon-${name}-`));
            directories.push(target);
            cpSync(source, target, {
                recursive: true,
                filter: (path) => !SKIPPED.some((entry) => path === join(source, entry))
            });
            await compileAddon(source, { outDirectory: join(target, 'scripts') });
            return target;
        })();
        built.set(name, directory);
    }
    return directory;
};

/** Reads an addon's pack from its folder. */
export const readAddonPack = (directory: string): ScriptPack => {
    const pack = readScriptPack(directory);
    if (pack === undefined) throw new Error(`${directory} has no script module`);
    return pack;
};

/**
 * An addon as Bedrock Dedicated Server runs it: the same files, with each import of a
 * `@jsprismarine/` module naming one the runtime refuses with the message BDS gives.
 * @returns The pack, and the temporary folder it was copied to, which the caller removes.
 */
export const addonPackOnBds = (source: string): { readonly pack: ScriptPack; readonly directory: string } => {
    const directory = mkdtempSync(join(tmpdir(), 'jsp-addon-bds-'));
    cpSync(source, directory, { recursive: true });
    const main = join(directory, 'scripts', 'main.js');
    const text = readFileSync(main, 'utf8');
    if (!text.includes("import('@jsprismarine/")) throw new Error(`${main} imports no @jsprismarine/ module`);
    writeFileSync(main, text.replaceAll("import('@jsprismarine/", "import('@jsprismarine/not-on-bds-"));
    return { pack: readAddonPack(directory), directory };
};
