import { createHash } from 'node:crypto';
import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';

import { AddonToolsErrors } from '@jsprismarine/errors/addon-tools';
import { JSPrismarineError } from '@jsprismarine/errors/JSPrismarineError';
import { parseLenientJson } from '@jsprismarine/packs/lenientJson';
import { parseManifest } from '@jsprismarine/packs/manifest';
import { writeZip } from '@jsprismarine/packs/zip';

import type { AddonIndexEntry } from './addonIndex';
import { isAddonName, isAddonVersion, packFileName } from './addonIndex';
import { isRecord } from './isRecord';
import { fileUrl } from './url';

/**
 * An addon is a behavior pack in a folder named for the addon: `manifest.json`, `scripts/` and a
 * `README.md`, plus an `addon.json` with what the index and the server's installer need beside the
 * manifest. The manifest header's version is the addon's version.
 */

/** The files every addon folder has. */
export const ADDON_FILES = ['manifest.json', 'addon.json', 'README.md'] as const;

/** The manifest module types an addon may declare: a behavior pack's. */
export const ADDON_MODULE_TYPES: readonly string[] = ['data', 'script'];

/** What `addon.json` holds. */
export interface AddonMetadata {
    /** A one-line description of what the addon does. */
    readonly description: string;
    /** The oldest JSPrismarine version the addon runs on, `major.minor.patch`. */
    readonly minServer: string;
    /** The addon's license, as an SPDX expression such as `MIT`. */
    readonly license: string;
}

/** An addon read from its folder and checked. */
export interface Addon extends AddonMetadata {
    /** The folder's name. */
    readonly name: string;
    /** The manifest header's version, `major.minor.patch`. */
    readonly version: string;
    /** Every file the pack holds, by its path in the folder with `/` separators, in path order. */
    readonly files: ReadonlyMap<string, Uint8Array>;
}

/** An addon's `.mcpack`. */
export interface AddonPack {
    /** `<name>-<version>.mcpack`. */
    readonly fileName: string;
    readonly bytes: Uint8Array;
    /** The pack's SHA-256, in lowercase hexadecimal. */
    readonly sha256: string;
}

const METADATA_KEYS: readonly string[] = ['description', 'minServer', 'license'] satisfies (keyof AddonMetadata)[];

/**
 * Reads every file under a folder, skipping names that start with a dot.
 * @throws {InvalidAddonError} `UnsupportedAddonEntry` for a link or another special entry.
 */
const readFiles = async (addon: string, root: string): Promise<Map<string, Uint8Array>> => {
    const paths: string[] = [];
    const walk = async (relative: string): Promise<void> => {
        for (const entry of await readdir(path.join(root, relative), { withFileTypes: true })) {
            if (entry.name.startsWith('.')) continue;
            const child = relative === '' ? entry.name : `${relative}/${entry.name}`;
            if (entry.isDirectory()) await walk(child);
            else if (entry.isFile()) paths.push(child);
            else throw new AddonToolsErrors.UnsupportedAddonEntry({ addon, path: child });
        }
    };
    await walk('');
    paths.sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));

    const files = new Map<string, Uint8Array>();
    for (const file of paths) files.set(file, new Uint8Array(await readFile(path.join(root, file))));
    return files;
};

const parseMetadata = (addon: string, bytes: Uint8Array): AddonMetadata => {
    const fail = (problem: string) => new AddonToolsErrors.InvalidAddonJson({ addon, problem });
    let value: unknown;
    try {
        value = JSON.parse(new TextDecoder().decode(bytes));
    } catch (cause) {
        throw new AddonToolsErrors.InvalidAddonJson({ addon, problem: 'it is not JSON' }, { cause });
    }
    if (!isRecord(value)) throw fail('it is not a JSON object');

    const unknown = Object.keys(value).filter((key) => !METADATA_KEYS.includes(key));
    if (unknown.length > 0) throw fail(`it has keys the schema does not, ${unknown.join(', ')}`);
    const text = (key: keyof AddonMetadata): string => {
        const field = value[key];
        if (typeof field !== 'string' || field.trim().length === 0) throw fail(`${key} must be a non-empty string`);
        return field;
    };

    const description = text('description');
    if (/[\r\n]/.test(description)) throw fail('description must be one line');
    const minServer = text('minServer');
    if (!isAddonVersion(minServer)) throw fail(`minServer must be a major.minor.patch version, got ${minServer}`);
    return { description, minServer, license: text('license') };
};

/** The manifest's header version, after checking it is a behavior pack whose modules agree. */
const checkManifest = (addon: string, files: ReadonlyMap<string, Uint8Array>): string => {
    const fail = (problem: string) => new AddonToolsErrors.InvalidAddonManifest({ addon, problem });
    let value: unknown;
    try {
        value = parseLenientJson(new TextDecoder().decode(files.get('manifest.json')));
    } catch (cause) {
        if (cause instanceof JSPrismarineError) throw fail(cause.message);
        throw cause;
    }

    const { manifest, diagnostics } = parseManifest(value, addon);
    if (!manifest) throw fail(diagnostics.map((diagnostic) => diagnostic.message).join('; '));

    // parseManifest reads a bare number such as 1.2 as [1.2, 0, 0], which no index accepts.
    const version = manifest.header.version.join('.');
    if (!isAddonVersion(version))
        throw fail(`the header's version must be three whole numbers, such as [1, 2, 3], got ${version}`);
    for (const module of manifest.modules) {
        if (!ADDON_MODULE_TYPES.includes(module.type))
            throw new AddonToolsErrors.NotABehaviorPack({ addon, type: module.type });
        const moduleVersion = module.version.join('.');
        if (moduleVersion !== version)
            throw new AddonToolsErrors.ModuleVersionDiffers({ addon, type: module.type, moduleVersion, version });
    }

    // parseManifest keeps what every pack shares; a script module's entry is read here.
    const modules = isRecord(value) && Array.isArray(value.modules) ? value.modules : [];
    // The script host reads a script pack's manifest with JSON.parse, so comments and trailing
    // commas that the lenient reader takes would stop the pack from loading on a server.
    if (modules.some((module) => isRecord(module) && module.type === 'script')) {
        try {
            JSON.parse(new TextDecoder().decode(files.get('manifest.json')));
        } catch (cause) {
            throw fail(
                `a script pack's manifest must be plain JSON: ${cause instanceof Error ? cause.message : String(cause)}`
            );
        }
    }
    for (const module of modules) {
        if (!isRecord(module) || module.type !== 'script') continue;
        if (typeof module.entry !== 'string') throw fail('a script module needs an entry');
        if (!files.has(module.entry)) throw new AddonToolsErrors.MissingScriptEntry({ addon, entry: module.entry });
    }
    return version;
};

/**
 * Reads an addon from its folder and checks it: the folder's name is an addon name, the three
 * {@link ADDON_FILES} are there, `manifest.json` is a behavior pack manifest whose modules carry
 * the header's version, each script module's entry exists, and `addon.json` follows
 * {@link AddonMetadata} with no other keys.
 *
 * @param directory - The addon's folder.
 * @throws {InvalidAddonError} When any check fails.
 */
export const readAddon = async (directory: string): Promise<Addon> => {
    const name = path.basename(path.resolve(directory));
    if (!isAddonName(name)) throw new AddonToolsErrors.InvalidAddonName({ name });

    const files = await readFiles(name, directory);
    for (const file of ADDON_FILES) {
        if (!files.has(file)) throw new AddonToolsErrors.MissingAddonFile({ addon: name, file });
    }
    const version = checkManifest(name, files);
    return { name, version, ...parseMetadata(name, files.get('addon.json')!), files };
};

/**
 * Zips an addon into its `.mcpack`. Entries are stored in path order and dated 1980-01-01, so
 * the same files always give the same bytes and the same hash, on any machine.
 */
export const packAddon = (addon: Addon): AddonPack => {
    const bytes = writeZip(addon.files);
    return {
        fileName: packFileName(addon.name, addon.version),
        bytes,
        sha256: createHash('sha256').update(bytes).digest('hex')
    };
};

/**
 * The index entry for an addon's pack.
 * @param baseUrl - Where the release's files download from; the pack's file name is added to it.
 */
export const addonIndexEntry = (addon: Addon, pack: AddonPack, baseUrl: string): AddonIndexEntry => ({
    name: addon.name,
    version: addon.version,
    description: addon.description,
    minServer: addon.minServer,
    url: fileUrl(baseUrl, pack.fileName),
    sha256: pack.sha256
});
