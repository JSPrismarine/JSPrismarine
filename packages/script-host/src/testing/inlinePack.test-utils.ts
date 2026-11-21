/**
 * A pack written from a source string, for tests that run a few lines of script as a pack: one
 * script module whose entry is the source, in a temporary folder the caller removes.
 */
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import type { ScriptPack } from '../host/pack';
import { readScriptPack } from '../host/pack';

/** What an inline pack declares besides its source. */
export interface InlinePackOptions {
    /** The `@minecraft/server` version it depends on. */
    readonly version?: string;
    readonly name?: string;
    readonly moduleUuid?: string;
}

/**
 * Writes a pack whose entry is `source`.
 * @returns The pack, and the temporary folder it was written to, which the caller removes.
 */
export const writeInlinePack = (
    source: string,
    { version = '2.0.0', name = 'probe', moduleUuid = '13f251b3-41c9-4271-b2d1-d4abde28890b' }: InlinePackOptions = {}
): { readonly pack: ScriptPack; readonly directory: string } => {
    const directory = mkdtempSync(join(tmpdir(), 'jsp-world-scripts-'));
    mkdirSync(join(directory, 'scripts'));
    writeFileSync(
        join(directory, 'manifest.json'),
        JSON.stringify({
            header: { name, uuid: 'aac52733-889b-4c87-abcb-f064ea7735a2', version: [1, 0, 0] },
            modules: [{ type: 'script', uuid: moduleUuid, entry: 'scripts/main.js' }],
            dependencies: [{ module_name: '@minecraft/server', version }]
        })
    );
    writeFileSync(join(directory, 'scripts', 'main.js'), source);
    const pack = readScriptPack(directory);
    if (pack === undefined) throw new Error('the pack has a script module');
    return { pack, directory };
};
