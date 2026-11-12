/**
 * Data the docs read out of the server's own code: the commands it registers and the settings it
 * writes. The docs facts and the search index both use it, so a page and a search result can never
 * describe a command or a setting differently.
 *
 * It runs the server's TypeScript, so it needs a TypeScript loader (`node --import tsx`).
 */

import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { repoRoot } from './project.mts';

/** One command the server registers. */
export interface CommandData {
    name: string;
    /** The one-line description the Bedrock client shows, or empty when the command has none. */
    description: string;
    /** The permission level's name, such as `admin`. */
    level: string;
    /** Up to a few usage lines, shortest first, without the leading slash. */
    usage: string[];
}

/** One `config.json` setting, as a fresh server writes it. */
export interface SettingData {
    key: string;
    /** The comment the server writes above the key. */
    comment: string;
}

/** Usage lines shown per command; the rest are a click away on the commands page. */
const USAGE_LINES = 4;

/** The commands the package implements, the ones the server registers, and the ones it leaves out. */
export async function loadCommands() {
    const commands = await import('../../packages/commands/src/index.ts');
    const server = await import('../../packages/prismarine/src/command/vanillaCommands.ts');
    const { CommandPermissionLevel } = await import('../../packages/minecraft/src/index.ts');

    const implemented = new commands.CommandRegistry();
    commands.registerVanillaCommands(implemented);
    const registry = server.buildVanillaCommands();
    // With `restricted` off the dispatcher never asks the source whether it may run a branch, so no real
    // command source is needed; the empty object only fills the parameter the type demands.
    const usageLines: string[] = registry.getDispatcher().getAllUsage(registry.getRoot(), {} as never, false);

    const registered: CommandData[] = registry.getNames().map((name: string) => {
        const metadata = registry.getMetadata(name);
        const description = metadata?.description ?? '';
        return {
            name,
            // An unset description is a translation key the client resolves, not text to show.
            description: description.startsWith('commands.') ? '' : description,
            level: String(CommandPermissionLevel[metadata?.permissionLevel ?? 0] ?? '')
                .toLowerCase()
                .replaceAll('_', ' '),
            usage: usageLines
                .filter((line) => line === name || line.startsWith(`${name} `))
                .sort((a, b) => a.length - b.length)
                .slice(0, USAGE_LINES)
        };
    });
    return {
        implemented: implemented.getNames().length,
        registered,
        unwired: Object.entries<string>(server.UNWIRED_COMMANDS)
    };
}

let freshConfig: Promise<string> | undefined;

/** The `config.json` the server's own config code writes into an empty folder, written once per run. */
function freshConfigText(): Promise<string> {
    freshConfig ??= (async () => {
        const { Config } = await import('../../packages/prismarine/src/config/Config.ts');
        const { readContentSettings } = await import('../../packages/prismarine/src/content/settings.ts');
        const folder = mkdtempSync(path.join(os.tmpdir(), 'jsp-docs-config-'));
        const cwd = process.cwd();
        try {
            // The config code writes to the working directory, so point it at the empty folder.
            process.chdir(folder);
            readContentSettings();
            await new Config().enable();
            return readFileSync(path.join(folder, 'config.json'), 'utf8');
        } finally {
            process.chdir(cwd);
            rmSync(folder, { recursive: true, force: true });
        }
    })();
    return freshConfig;
}

/**
 * Every `config.json` setting, read from the file the server's own config code writes into an empty
 * folder, so the list is exactly what a fresh server of this version writes.
 */
export async function loadSettings(): Promise<SettingData[]> {
    const written = await freshConfigText();
    // A comment line, then the top-level key it explains, as the config writer lays them out. Values
    // are left out: some, such as `chunk-workers`, depend on the machine that wrote the file.
    return [...written.matchAll(/^ {4}\/\/ (.+)\n {4}"([^"]+)":/gm)].map(([, comment, key]) => ({ key, comment }));
}

/** The settings a fresh config leaves out, which the server still reads, with their comments. */
export async function loadOptionalSettings(): Promise<SettingData[]> {
    const { optionalSettings } = await import('../../packages/prismarine/src/config/Config.ts');
    return optionalSettings().map(({ key, comment }) => ({ key, comment }));
}

/** One key of the `stats.bstats` section, as a fresh server writes it. */
export interface BStatsSettingData {
    /** The full path, such as `stats.bstats.enabled`. */
    key: string;
    /** The value a fresh server writes. */
    value: string;
    /** The key's description, from its doc comment on `BStatsConfig`. */
    description: string;
}

/**
 * The `stats.bstats` settings: each key and value from the file a fresh server writes, with the doc
 * comment `BStatsConfig` gives the key, which is also the description in the config schema.
 */
export async function loadBStatsSettings(): Promise<BStatsSettingData[]> {
    const { parseConfigDocument } = await import('../../packages/prismarine/src/config/ConfigDocument.ts');
    const section = parseConfigDocument(await freshConfigText()).get(['stats', 'bstats']);
    if (typeof section !== 'object' || section === null) {
        throw new Error('The docs facts no longer find stats.bstats in a fresh config.json.');
    }
    const source = readFileSync(
        path.join(repoRoot, 'packages', 'prismarine', 'src', 'config', 'JsonConfigTypes.ts'),
        'utf8'
    );
    const body = /export interface BStatsConfig \{([\s\S]*?)\n\}/.exec(source)?.[1] ?? '';
    const descriptions = new Map(
        [...body.matchAll(/\/\*\* (.+?) \*\/\n\s+'?([\w-]+)'?\?:/g)].map(([, description, key]) => [key, description])
    );
    return Object.entries(section).map(([key, value]) => {
        const description = descriptions.get(key);
        if (!description)
            throw new Error(`The docs facts find no doc comment for stats.bstats.${key} on BStatsConfig.`);
        return { key: `stats.bstats.${key}`, value: JSON.stringify(value), description };
    });
}
