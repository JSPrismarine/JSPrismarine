/**
 * Reads behavior packs with a script module, and the `config/` folder that sets what each one
 * may use, in the layout Bedrock Dedicated Server (BDS) reads them in, so a pack and its
 * configuration move from BDS without edits.
 */
import { existsSync, readFileSync, readdirSync, realpathSync } from 'node:fs';
import { isAbsolute, join, relative, resolve, sep } from 'node:path';

import { isRecord } from '../isRecord';
import type { ModuleDependency } from '../shape/resolve';

/** A behavior pack whose manifest has a `script` module. */
export interface ScriptPack {
    /** The pack's directory. */
    readonly directory: string;
    /** The header name, which BDS's content log names the pack by. */
    readonly name: string;
    /** The header version, such as `1.0.0`. */
    readonly version: string;
    /** The header UUID. */
    readonly uuid: string;
    /** The script module's UUID, which names its folder under `config/`. */
    readonly moduleUuid: string;
    /** The script module's entry, relative to the pack, such as `scripts/main.js`. */
    readonly entry: string;
    /** The native modules the manifest declares, such as `@minecraft/server`. */
    readonly dependencies: readonly ModuleDependency[];
}

/** How BDS's resolution messages name a pack: its header name and version, such as `my pack - 1.0.0`. */
export const packLabel = (pack: ScriptPack): string => `${pack.name} - ${pack.version}`;

const versionText = (value: unknown): string | undefined => {
    if (typeof value === 'string') return value;
    if (Array.isArray(value) && value.every((part) => Number.isInteger(part))) return value.join('.');
    return undefined;
};

/**
 * Reads a behavior pack's manifest.
 * @param directory - The pack's directory, holding `manifest.json`.
 * @returns The pack, or undefined when it has no manifest or no `script` module with an entry.
 * @throws {Error} When the manifest is not JSON, or its header lacks a name, a UUID or a version.
 */
export const readScriptPack = (directory: string): ScriptPack | undefined => {
    const path = join(directory, 'manifest.json');
    if (!existsSync(path)) return undefined;
    const manifest: unknown = JSON.parse(readFileSync(path, 'utf8'));
    if (!isRecord(manifest)) throw new Error(`${path} is not an object`);
    const modules = Array.isArray(manifest.modules) ? manifest.modules : [];
    const script = modules.find(
        (module): module is Record<string, unknown> =>
            isRecord(module) && module.type === 'script' && typeof module.entry === 'string'
    );
    if (script === undefined) return undefined;

    const { header } = manifest;
    const version = isRecord(header) ? versionText(header.version) : undefined;
    if (!isRecord(header) || typeof header.name !== 'string' || typeof header.uuid !== 'string' || !version) {
        throw new Error(`${path} has no header name, uuid and version`);
    }
    if (typeof script.uuid !== 'string' || typeof script.entry !== 'string') {
        throw new Error(`${path} has a script module without a uuid`);
    }

    const dependencies: ModuleDependency[] = [];
    for (const dependency of Array.isArray(manifest.dependencies) ? manifest.dependencies : []) {
        if (!isRecord(dependency) || typeof dependency.module_name !== 'string') continue;
        const dependencyVersion = versionText(dependency.version);
        if (dependencyVersion !== undefined) {
            dependencies.push({ module_name: dependency.module_name, version: dependencyVersion });
        }
    }
    return {
        directory,
        name: header.name,
        version,
        uuid: header.uuid,
        moduleUuid: script.uuid,
        entry: script.entry,
        dependencies
    };
};

/** Whether `file` is below `root`, both resolved paths. */
const isBelow = (root: string, file: string): boolean => {
    const inside = relative(root, file);
    return inside !== '' && inside !== '..' && !inside.startsWith(`..${sep}`) && !isAbsolute(inside);
};

/**
 * Reads a file of a pack, by its path relative to the pack. A symbolic link counts by where it
 * points, so a link to a file outside the pack reads nothing.
 * @returns Its text, or undefined when it does not exist or the path leaves the pack.
 */
export const readPackFile = (pack: ScriptPack, path: string): string | undefined => {
    const root = resolve(pack.directory);
    const file = resolve(root, path);
    if (!isBelow(root, file) || !existsSync(file)) return undefined;
    const target = realpathSync(file);
    if (!isBelow(realpathSync(root), target)) return undefined;
    return readFileSync(target, 'utf8');
};

/** Every JavaScript file of a pack's `scripts` folder, by its path relative to the pack. */
export const packScripts = (pack: ScriptPack): Map<string, string> => {
    const scripts = new Map<string, string>();
    const root = join(pack.directory, 'scripts');
    if (!existsSync(root)) return scripts;
    for (const entry of readdirSync(root, { recursive: true, withFileTypes: true })) {
        if (!entry.isFile() || !entry.name.endsWith('.js')) continue;
        const path = join(entry.parentPath, entry.name);
        scripts.set(relative(pack.directory, path).split(sep).join('/'), readFileSync(path, 'utf8'));
    }
    return scripts;
};

/**
 * The modules a world may use when its `config/default/permissions.json` is missing: the list
 * that file holds in the pinned BDS archive.
 */
export const DEFAULT_ALLOWED_MODULES: readonly string[] = [
    '@minecraft/server-gametest',
    '@minecraft/server',
    '@minecraft/server-ui',
    '@minecraft/server-admin',
    '@minecraft/server-editor',
    '@minecraft/debug-utilities'
];

/** What `config/` says about one script module. */
export interface ScriptModuleConfig {
    /** `allowed_modules` from `permissions.json`. */
    readonly allowedModules: readonly string[];
    /** `variables.json`, which `@minecraft/server-admin`'s `variables` reads. */
    readonly variables: Readonly<Record<string, unknown>>;
    /** `secrets.json`, which `@minecraft/server-admin`'s `secrets` reads. */
    readonly secrets: Readonly<Record<string, string>>;
}

/** The configuration of every script module, read from a BDS `config/` folder. */
export interface ScriptConfig {
    /** What applies to the script module with this UUID. */
    module(moduleUuid: string): ScriptModuleConfig;
}

const readJsonObject = (path: string): Record<string, unknown> | undefined => {
    if (!existsSync(path)) return undefined;
    const value: unknown = JSON.parse(readFileSync(path, 'utf8'));
    if (!isRecord(value)) throw new Error(`${path} is not an object`);
    return value;
};

const stringList = (value: unknown): string[] | undefined =>
    Array.isArray(value) && value.every((entry) => typeof entry === 'string') ? value : undefined;

const stringValues = (value: Record<string, unknown> | undefined): Record<string, string> | undefined =>
    value === undefined
        ? undefined
        : Object.fromEntries(
              Object.entries(value).filter((entry): entry is [string, string] => typeof entry[1] === 'string')
          );

/**
 * Reads a BDS `config/` folder: `default/` for every pack, and a folder named after a script
 * module's UUID for that module. A file in a module's folder replaces the same file in
 * `default/`, as the `config-permissions` scenario of the parity suite records BDS doing for
 * `permissions.json`; BDS documents no merge for the other two files either.
 * @param directory - The `config/` folder, or undefined for a server without one.
 * @throws {Error} When a file there is not a JSON object.
 */
export const readScriptConfig = (directory: string | undefined): ScriptConfig => {
    const read = (folder: string, file: string): Record<string, unknown> | undefined =>
        directory === undefined ? undefined : readJsonObject(join(directory, folder, file));
    const defaults: ScriptModuleConfig = {
        allowedModules: stringList(read('default', 'permissions.json')?.allowed_modules) ?? DEFAULT_ALLOWED_MODULES,
        variables: read('default', 'variables.json') ?? {},
        secrets: stringValues(read('default', 'secrets.json')) ?? {}
    };
    // A module's folder is named by its UUID; anything else in the manifest could reach outside `config/`.
    const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    return {
        module: (moduleUuid) => {
            if (!uuidPattern.test(moduleUuid)) return defaults;
            return {
                allowedModules:
                    stringList(read(moduleUuid, 'permissions.json')?.allowed_modules) ?? defaults.allowedModules,
                variables: read(moduleUuid, 'variables.json') ?? defaults.variables,
                secrets: stringValues(read(moduleUuid, 'secrets.json')) ?? defaults.secrets
            };
        }
    };
};
