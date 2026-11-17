/**
 * Counts one corpus pack: reads its `manifest.json` for the native modules it declares and their
 * versions, picks the generated shape each one resolves to, and runs the usage counter over its
 * script files.
 */
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { extname, join, relative } from 'node:path';

import type { ModuleHistory, VersionStability } from '../../src/shape/format.ts';
import type { ModuleShape } from '../../src/shape/history.ts';
import { shapeAt } from '../../src/shape/history.ts';
import { parseVersion } from '../../src/shape/version.ts';
import { isRecord } from '../../src/isRecord.ts';
import type { CorpusPack } from './manifest.mts';
import { UsageCollector } from './usage.mts';

/** The script languages the counter reads, by file extension. */
const LANGUAGES: Readonly<Record<string, 'javascript' | 'typescript'>> = {
    '.cjs': 'javascript',
    '.js': 'javascript',
    '.mjs': 'javascript',
    '.cts': 'typescript',
    '.mts': 'typescript',
    '.ts': 'typescript'
};

/** Directories that hold tests or dependencies rather than the pack's scripts. */
const SKIPPED_DIRECTORIES: ReadonlySet<string> = new Set(['node_modules', '__tests__', '__mocks__']);

/** Test files and declaration files, which run nowhere in a pack. */
const SKIPPED_FILE = /\.(test|spec)\.[cm]?[jt]s$|\.d\.[cm]?ts$/;

/** How a pack uses one module. */
export interface ModuleUsage {
    /** The version the pack's manifest declares, or undefined when it imports the module undeclared. */
    readonly declared?: string;
    readonly stability: VersionStability;
    /** The generated version the counter resolved against, or undefined when none is generated. */
    readonly shape?: string;
    /** Occurrences of each declaration (`world`) and member (`World.sendMessage`). */
    readonly uses: ReadonlyMap<string, number>;
    /** Occurrences of interface fields (`Vector3.x`), which are plain object properties. */
    readonly fields: ReadonlyMap<string, number>;
    /** Occurrences of members the generated shape lacks on a type it has. */
    readonly unmatched: ReadonlyMap<string, number>;
}

/** What one pack uses. */
export interface PackUsage {
    readonly id: string;
    /** Script files read, by language. */
    readonly files: Readonly<Record<'javascript' | 'typescript', number>>;
    readonly modules: ReadonlyMap<string, ModuleUsage>;
    /** The first parse error of each file that had one, by path relative to the repository. */
    readonly parseErrors: ReadonlyMap<string, string>;
}

/** The `dependencies` of a pack manifest that name a module, as `module_name` to `version`. */
const readDeclaredModules = (path: string): Map<string, string> => {
    // A pack manifest is JSON; only its module dependencies are read, each checked below.
    const manifest: unknown = JSON.parse(readFileSync(path, 'utf8'));
    const dependencies = isRecord(manifest) && Array.isArray(manifest.dependencies) ? manifest.dependencies : [];
    const declared = new Map<string, string>();
    for (const dependency of dependencies) {
        if (!isRecord(dependency)) continue;
        const { module_name: module, version } = dependency;
        if (typeof module === 'string' && typeof version === 'string') declared.set(module, version);
    }
    return declared;
};

/** Whether a declared version is a prerelease, such as `2.12.0-beta` or plain `beta`. */
const stabilityOf = (version: string | undefined): VersionStability =>
    version !== undefined && (version === 'beta' || parseVersion(version)?.tag !== undefined) ? 'beta' : 'stable';

/**
 * The generated version a declared version is counted against. A stable version gets what BDS
 * serves, the newest minor of its major version. A beta version gets the beta the pinned server
 * ships when that beta has the same major version, whichever beta it names: BDS serves only that
 * one and refuses a pack that names another, so it is the closest shape to what the pack was
 * written against. A beta of another major version, such as `1.17.0-beta` beside a shipped
 * `2.11.0-beta`, gets the newest stable minor of its own major version.
 */
export const shapeVersionFor = (history: ModuleHistory, declared: string | undefined): string | undefined => {
    const newest = history.versions.filter((entry) => entry.stability === 'stable').at(-1)?.version;
    if (declared === undefined) return newest;
    const beta = history.versions.filter((entry) => entry.stability === 'beta').at(-1)?.version;
    if (declared === 'beta') return beta ?? newest;
    const major = parseVersion(declared)?.major;
    if (stabilityOf(declared) === 'beta' && beta !== undefined && parseVersion(beta)?.major === major) return beta;
    return (major === undefined ? undefined : history.resolves[String(major)]) ?? newest;
};

/** Every script file under a pack's sources, sorted, without tests and excluded paths. */
const listScripts = (root: string, pack: CorpusPack): string[] => {
    const excluded = pack.exclude.map((path) => join(root, path));
    const files: string[] = [];
    const walk = (directory: string): void => {
        for (const entry of readdirSync(directory, { withFileTypes: true })) {
            const path = join(directory, entry.name);
            if (excluded.some((prefix) => path === prefix || path.startsWith(`${prefix}/`))) continue;
            if (entry.isDirectory()) {
                if (!SKIPPED_DIRECTORIES.has(entry.name)) walk(path);
            } else if (
                entry.isFile() &&
                LANGUAGES[extname(entry.name)] !== undefined &&
                !SKIPPED_FILE.test(entry.name)
            ) {
                files.push(path);
            }
        }
    };
    for (const source of pack.sources) {
        const directory = join(root, source);
        if (!existsSync(directory)) throw new Error(`Corpus pack ${pack.id} has no ${source} at its pinned commit`);
        walk(directory);
    }
    return files.sort();
};

/**
 * Counts what one pack uses.
 * @param root - The pack's repository, unpacked at its pinned commit.
 * @param histories - The generated module histories, by module name.
 * @throws {Error} Naming the pack, when its manifest or a source directory is missing.
 */
export const countPack = (
    pack: CorpusPack,
    root: string,
    histories: Readonly<Record<string, ModuleHistory>>
): PackUsage => {
    const manifestPath = join(root, pack.manifest);
    if (!existsSync(manifestPath))
        throw new Error(`Corpus pack ${pack.id} has no ${pack.manifest} at its pinned commit`);
    const declared = readDeclaredModules(manifestPath);

    const shapes = new Map<string, ModuleShape | undefined>();
    const shape = (module: string): ModuleShape | undefined => {
        if (!shapes.has(module)) {
            const history = histories[module];
            const version = history === undefined ? undefined : shapeVersionFor(history, declared.get(module));
            shapes.set(module, history === undefined || version === undefined ? undefined : shapeAt(history, version));
        }
        return shapes.get(module);
    };
    const collector = new UsageCollector({
        isNative: (module) => declared.has(module) || histories[module] !== undefined,
        shape
    });

    const files = { javascript: 0, typescript: 0 };
    const scripts = listScripts(root, pack);
    for (const file of scripts) {
        const language = LANGUAGES[extname(file)];
        if (language !== undefined) files[language] += 1;
    }
    const errors = collector.addFiles(scripts.map((file) => ({ name: file, code: readFileSync(file, 'utf8') })));
    const parseErrors = new Map([...errors].map(([file, error]) => [relative(root, file), error]));

    const modules = new Map<string, ModuleUsage>();
    for (const module of [...new Set([...declared.keys(), ...collector.modules.keys()])].sort()) {
        if (!declared.has(module) && histories[module] === undefined) continue;
        const version = declared.get(module);
        const uses = collector.modules.get(module);
        modules.set(module, {
            ...(version === undefined ? {} : { declared: version }),
            stability: stabilityOf(version),
            ...(shape(module) === undefined ? {} : { shape: shape(module)?.version.version }),
            uses: uses?.uses ?? new Map(),
            fields: uses?.fields ?? new Map(),
            unmatched: uses?.unmatched ?? new Map()
        });
    }
    return { id: pack.id, files, modules, parseErrors };
};
