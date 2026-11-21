/**
 * Data the docs read out of the server's own code: the commands it registers and the settings it
 * writes. The docs facts and the search index both use it, so a page and a search result can never
 * describe a command or a setting differently.
 *
 * It runs the server's TypeScript, so it needs a TypeScript loader (`node --import tsx`).
 */

import { mkdtempSync, readdirSync, readFileSync, rmSync } from 'node:fs';
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

/** One command a running server answers, its own commands included, with what gates it. */
export interface ServerCommandData {
    name: string;
    /** Other names that run the same command, such as `tp` for `teleport`. */
    aliases: string[];
    /** The one-line description the Bedrock client shows. */
    description: string;
    /** The Java permission level the command needs: 0 for anyone, 4 for an operator. */
    level: number;
    /** The `permissions.json` node that gates it. */
    permission: string;
    /** Whether a fresh `permissions.json` grants the node to every player. */
    everyone: boolean;
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
 * Every command the server answers, in the order it registers them: the vanilla set, then the
 * server's own commands, each with its permission node and level.
 */
export async function loadServerCommands(): Promise<ServerCommandData[]> {
    const { buildVanillaCommands } = await import('../../packages/prismarine/src/command/vanillaCommands.ts');
    const { registerJsprismarineCommands } =
        await import('../../packages/prismarine/src/command/jsprismarineCommands.ts');
    const { commandPermissionOf } = await import('../../packages/prismarine/src/command/CommandManager.ts');
    const { DEFAULT_PLAYER_PERMISSIONS } = await import('../../packages/prismarine/src/permission/PermissionsFile.ts');

    const registry = buildVanillaCommands();
    // Registering only builds the tree; the server is read when a command runs, which never happens here.
    registerJsprismarineCommands(registry, {} as never);
    return registry.getNames().map((name: string) => {
        const metadata = registry.getMetadata(name);
        const permission = commandPermissionOf(name);
        return {
            name,
            aliases: [...(metadata?.aliases ?? [])],
            description: metadata?.description ?? '',
            level: metadata?.permissionLevel ?? 0,
            permission,
            everyone: DEFAULT_PLAYER_PERMISSIONS.includes(permission)
        };
    });
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

/** One error of the catalog in `@jsprismarine/errors`. */
export interface ErrorData {
    code: string;
    /** How code throws it, such as `LeveldbErrors.DatabaseLocked`. */
    thrownAs: string;
    /** The message with its `{name}` placeholders. */
    template: string;
    /** The class it extends: `Error`, `TypeError`, `RangeError` or one of the domain's categories. */
    base: string;
    /** The entry's JSDoc, or empty when it has none. */
    description: string;
}

/** A class a domain's errors extend so code can catch them together, such as `CorruptionError`. */
export interface ErrorCategoryData {
    name: string;
    description: string;
}

/** One domain of the catalog: the errors a package throws, with a page of its own in the reference. */
export interface ErrorDomainData {
    domain: string;
    /** The modules the domain's catalog is split across, such as `world` for `prismarine/world.ts`. */
    groups: { module: string; errors: ErrorData[] }[];
    categories: ErrorCategoryData[];
}

/** How many errors a domain defines, across its modules. */
export const errorCount = ({ groups }: ErrorDomainData) =>
    groups.reduce((total, { errors }) => total + errors.length, 0);

/** What `defineErrors` puts on each class it makes. */
interface DefinedErrorClass {
    readonly code: string;
    readonly domain: string;
    readonly template: string;
}

const isDefinedErrorClass = (value: unknown): value is DefinedErrorClass =>
    typeof value === 'function' && 'code' in value && 'domain' in value && 'template' in value;

/** A JSDoc comment as Markdown: its text, with `{@link X}` written as inline code. */
const jsdocText = (node: import('typescript').Node, ts: typeof import('typescript')) =>
    ts
        .getJSDocCommentsAndTags(node)
        .filter(ts.isJSDoc)
        .map((doc) => ts.getTextOfJSDocComment(doc.comment) ?? '')
        .join('\n\n')
        .replace(/\{@link ([^}\s|]+)[^}]*\}/g, '`$1`')
        .trim();

/**
 * Every error the catalog in `@jsprismarine/errors` defines, by domain. The codes, templates and
 * classes come from the modules themselves; the descriptions are their JSDoc, read from the source.
 */
export async function loadErrors(): Promise<ErrorDomainData[]> {
    const { default: ts } = await import('typescript');
    const catalogDir = path.join(repoRoot, 'packages', 'errors', 'src');
    const files = readdirSync(catalogDir, { recursive: true, encoding: 'utf8' })
        .filter((file) => file.endsWith('.ts') && !file.includes('.test.') && file !== 'JSPrismarineError.ts')
        .sort();

    const domains = new Map<string, ErrorDomainData>();
    for (const file of files) {
        const source = readFileSync(path.join(catalogDir, file), 'utf8');
        const parsed = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true);
        const descriptions = new Map<string, string>();
        const visit = (node: import('typescript').Node) => {
            if (
                (ts.isPropertyAssignment(node) || ts.isClassDeclaration(node)) &&
                node.name &&
                ts.isIdentifier(node.name)
            ) {
                descriptions.set(node.name.text, jsdocText(node, ts));
            }
            ts.forEachChild(node, visit);
        };
        visit(parsed);

        const exports: Record<string, unknown> = await import(path.join(catalogDir, file));
        const module = file.replace(/\.ts$/, '').split(path.sep);
        const domainName = module[0];
        const domain = domains.get(domainName) ?? { domain: domainName, groups: [], categories: [] };
        domains.set(domainName, domain);
        const errors: ErrorData[] = [];
        for (const [exported, value] of Object.entries(exports)) {
            if (typeof value === 'function' && !isDefinedErrorClass(value)) {
                domain.categories.push({ name: exported, description: descriptions.get(exported) ?? '' });
                continue;
            }
            if (typeof value !== 'object' || value === null) continue;
            for (const [key, error] of Object.entries(value)) {
                if (!isDefinedErrorClass(error)) continue;
                errors.push({
                    code: error.code,
                    thrownAs: `${exported}.${key}`,
                    template: error.template,
                    base: Object.getPrototypeOf(error).name,
                    description: descriptions.get(key) ?? ''
                });
            }
        }
        domain.groups.push({
            module: module.slice(1).join('/'),
            errors: errors.sort((a, b) => a.code.localeCompare(b.code))
        });
    }
    return [...domains.values()];
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
        // A JSON Schema tag such as `@pattern` ends the prose part of a comment.
        [...body.matchAll(/\/\*\* (.+?) \*\/\n\s+'?([\w-]+)'?\?:/g)].map(([, description, key]) => [
            key,
            description.replace(/\s*@\w+.*$/, '')
        ])
    );
    return Object.entries(section).map(([key, value]) => {
        const description = descriptions.get(key);
        if (!description)
            throw new Error(`The docs facts find no doc comment for stats.bstats.${key} on BStatsConfig.`);
        return { key: `stats.bstats.${key}`, value: JSON.stringify(value), description };
    });
}
