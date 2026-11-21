/**
 * JSPrismarine's own addons under `addons/` as packs a test runs: each one's real files, and a
 * copy of one as Bedrock Dedicated Server runs it, without `@jsprismarine/server`.
 */
import { cpSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import type { ScriptPack } from '../host/pack';
import { readScriptPack } from '../host/pack';

/** The folder of an addon in this repository. */
export const addonDirectory = (name: string): string =>
    fileURLToPath(new URL(`../../../../addons/${name}`, import.meta.url));

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
