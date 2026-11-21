/**
 * The two files that record a server's addons, beside `config.json`:
 *
 * - `addons.json` says what the owner asked for, keyed by each addon's local name. The `addon`
 *   command writes it, and the owner may edit it by hand.
 * - `addons.lock.json` pins what was installed for each key: where it came from, its version and
 *   its SHA-256, and, for an addon from a source, whether its listing deprecates that version.
 *   Only the command writes it.
 *
 * A key is also the addon's folder under `addons/`, so two sources' addons with the same name
 * install side by side under different keys.
 */
import { randomUUID } from 'node:crypto';
import { readFile, rename, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';

import {
    isAddonInstallId,
    isAddonName,
    isAddonRange,
    isAddonRepository,
    isAddonVersion
} from '@jsprismarine/addon-tools/addonIndex';
import { PrismarineAddonErrors } from '@jsprismarine/errors/prismarine/addon';

import { isRecord } from '../utils/isRecord';

/** The file that says which addons the owner asked for. */
export const ADDONS_FILE = 'addons.json';

/** The file that pins what each addon resolved to. */
export const ADDONS_LOCK_FILE = 'addons.lock.json';

/** The lockfile format this server writes and reads. */
export const ADDONS_LOCKFILE_VERSION = 1;

/** The folder beside `config.json` that holds one folder per installed addon. */
export const ADDONS_DIRECTORY = 'addons';

/** The source a bare addon name installs from: JSPrismarine's own repository. */
export const DEFAULT_ADDON_SOURCE = 'JSPrismarine/JSPrismarine';

/** Whether a string names a GitHub repository, `<owner>/<repo>`. */
export const isAddonSource = (source: string): boolean => isAddonRepository(source);

const SHA256 = /^[0-9a-f]{64}$/;

/** What the owner asked for under one key. */
export type AddonRequest =
    /** An addon from a source's index; `name` defaults to the key. */
    | { readonly source: string; readonly name?: string; readonly version: string }
    /** An `.mcpack` at an `https:` URL. */
    | { readonly url: string }
    /** A folder or an `.mcpack` on disk, relative to the server's folder unless absolute. */
    | { readonly path: string };

/** Why an addon's author deprecated a version, as its index entry's listing says. */
export interface AddonDeprecation {
    /** The author's reason, such as `Use warps-plus instead.` */
    readonly deprecated?: string;
    /** The install id of the addon that replaces it. */
    readonly replacedBy?: string;
}

/** What one key resolved to and was installed from. */
export type LockedAddon =
    | ({
          readonly source: string;
          readonly name: string;
          readonly version: string;
          readonly url: string;
          readonly sha256: string;
      } & AddonDeprecation)
    | { readonly url: string; readonly name: string; readonly version: string; readonly sha256: string }
    /** A folder has no hash: the addon's folder links to it, so edits show after `/reload`. */
    | { readonly path: string; readonly name: string; readonly version: string; readonly sha256?: string };

/** `addons.json`. */
export interface AddonsFile {
    readonly addons: Readonly<Record<string, AddonRequest>>;
}

/** `addons.lock.json`. */
export interface AddonsLockFile {
    readonly lockfileVersion: typeof ADDONS_LOCKFILE_VERSION;
    readonly addons: Readonly<Record<string, LockedAddon>>;
}

/** Whether a locked addon came from a source's index. */
export const isSourceLock = (locked: LockedAddon): locked is Extract<LockedAddon, { source: string }> =>
    'source' in locked;

/** Whether a locked addon was installed from a path on disk. */
export const isPathLock = (locked: LockedAddon): locked is Extract<LockedAddon, { path: string }> => 'path' in locked;

/** Reads one string field, failing with the file and the key's path. */
const reader = (file: string, where: string, value: Record<string, unknown>) => {
    const fail = (problem: string) => new PrismarineAddonErrors.InvalidAddonsFile({ file, problem });
    return {
        fail,
        text: (key: string, check?: (text: string) => boolean, expected?: string): string => {
            const field = value[key];
            if (typeof field !== 'string' || field.length === 0) throw fail(`${where}.${key} is not a string`);
            if (check && !check(field)) throw fail(`${where}.${key} is ${JSON.stringify(field)}, not ${expected}`);
            return field;
        },
        optional: (key: string) => key in value
    };
};

const parseRequest = (key: string, value: unknown): AddonRequest => {
    const where = `addons.${key}`;
    if (!isRecord(value))
        throw new PrismarineAddonErrors.InvalidAddonsFile({ file: ADDONS_FILE, problem: `${where} is not an object` });
    const { fail, text, optional } = reader(ADDONS_FILE, where, value);
    const locators = ['source', 'url', 'path'].filter(optional);
    if (locators.length > 1) throw fail(`${where} has ${locators.join(' and ')}, and an entry takes one of them`);
    if (optional('source')) {
        const source = text('source', isAddonSource, 'an owner/repo');
        const version = text('version', isAddonRange, 'a range such as ^1.0.0, ~1.0.0, 1.0.0 or *');
        if (!optional('name')) return { source, version };
        return { source, name: text('name', isAddonName, 'an addon name'), version };
    }
    if (optional('url')) return { url: text('url', isHttpsUrl, 'an https URL') };
    if (optional('path')) return { path: text('path') };
    throw fail(`${where} has none of source, url and path`);
};

const parseLocked = (key: string, value: unknown): LockedAddon => {
    const where = `addons.${key}`;
    if (!isRecord(value))
        throw new PrismarineAddonErrors.InvalidAddonsFile({
            file: ADDONS_LOCK_FILE,
            problem: `${where} is not an object`
        });
    const { fail, text, optional } = reader(ADDONS_LOCK_FILE, where, value);
    const name = text('name', isAddonName, 'an addon name');
    const version = text('version', isAddonVersion, 'a major.minor.patch version');
    const sha256 = () => text('sha256', (hash) => SHA256.test(hash), '64 lowercase hexadecimal digits');
    if (optional('path')) {
        if (optional('url') || optional('source'))
            throw fail(`${where} has a path and a ${optional('url') ? 'url' : 'source'}, and a lock takes one of them`);
        const installedFrom = text('path');
        return optional('sha256')
            ? { path: installedFrom, name, version, sha256: sha256() }
            : { path: installedFrom, name, version };
    }
    if (!optional('url')) throw fail(`${where} has neither a url nor a path`);
    const url = text('url', isHttpsUrl, 'an https URL');
    if (optional('source')) {
        const source = text('source', isAddonSource, 'an owner/repo');
        const deprecated = optional('deprecated') ? text('deprecated') : undefined;
        const replacedBy = optional('replacedBy') ? text('replacedBy', isAddonInstallId, 'an install id') : undefined;
        return {
            source,
            name,
            version,
            url,
            sha256: sha256(),
            ...(deprecated === undefined ? {} : { deprecated }),
            ...(replacedBy === undefined ? {} : { replacedBy })
        };
    }
    return { url, name, version, sha256: sha256() };
};

/** Whether a string is an `https:` URL. */
export const isHttpsUrl = (url: string): boolean => URL.canParse(url) && new URL(url).protocol === 'https:';

/** Each entry of an object, after checking its key is an addon name. */
const entriesOf = <T>(file: string, value: unknown, parse: (key: string, entry: unknown) => T): Record<string, T> => {
    if (!isRecord(value))
        throw new PrismarineAddonErrors.InvalidAddonsFile({ file, problem: 'addons is not an object' });
    const entries: Record<string, T> = {};
    for (const [key, entry] of Object.entries(value)) {
        if (!isAddonName(key))
            throw new PrismarineAddonErrors.InvalidAddonsFile({
                file,
                problem: `${JSON.stringify(key)} is not an addon name`
            });
        entries[key] = parse(key, entry);
    }
    return entries;
};

/** Reads a JSON file, or undefined when there is none. */
const readJson = async (file: string): Promise<unknown> => {
    let text: string;
    try {
        text = await readFile(file, 'utf8');
    } catch (error: unknown) {
        if (isRecord(error) && error.code === 'ENOENT') return undefined;
        throw error;
    }
    try {
        return JSON.parse(text);
    } catch (cause) {
        throw new PrismarineAddonErrors.InvalidAddonsFile(
            { file: path.basename(file), problem: 'it is not JSON' },
            { cause }
        );
    }
};

/**
 * Validates a decoded `addons.json`.
 * @throws {PrismarineAddonErrors.InvalidAddonsFile} When it breaks the format.
 */
export const parseAddonsFile = (value: unknown): AddonsFile => {
    if (!isRecord(value))
        throw new PrismarineAddonErrors.InvalidAddonsFile({ file: ADDONS_FILE, problem: 'it is not a JSON object' });
    return { addons: entriesOf(ADDONS_FILE, value.addons, parseRequest) };
};

/**
 * Validates a decoded `addons.lock.json`.
 * @throws {PrismarineAddonErrors.InvalidAddonsFile} When it breaks the format or has another
 * `lockfileVersion`.
 */
export const parseAddonsLockFile = (value: unknown): AddonsLockFile => {
    const fail = (problem: string) => new PrismarineAddonErrors.InvalidAddonsFile({ file: ADDONS_LOCK_FILE, problem });
    if (!isRecord(value)) throw fail('it is not a JSON object');
    if (value.lockfileVersion !== ADDONS_LOCKFILE_VERSION)
        throw fail(
            `lockfileVersion is ${JSON.stringify(value.lockfileVersion)}, and this server reads ${ADDONS_LOCKFILE_VERSION}`
        );
    return { lockfileVersion: ADDONS_LOCKFILE_VERSION, addons: entriesOf(ADDONS_LOCK_FILE, value.addons, parseLocked) };
};

/** Both files, read from a server's folder; a missing file reads as empty. */
export const readAddonFiles = async (
    directory: string
): Promise<{ readonly requested: AddonsFile; readonly lock: AddonsLockFile }> => {
    const requested = await readJson(path.join(directory, ADDONS_FILE));
    const lock = await readJson(path.join(directory, ADDONS_LOCK_FILE));
    return {
        requested: requested === undefined ? { addons: {} } : parseAddonsFile(requested),
        lock: lock === undefined ? { lockfileVersion: ADDONS_LOCKFILE_VERSION, addons: {} } : parseAddonsLockFile(lock)
    };
};

/** An object with its keys sorted, so a rewrite of the same addons writes the same text. */
const sortedByKey = <T>(entries: Readonly<Record<string, T>>): Record<string, T> =>
    Object.fromEntries(Object.entries(entries).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)));

/** `addons.json` as the server writes it: keys sorted, four-space indented, ending in a newline. */
export const serializeAddonsFile = (requested: AddonsFile): string =>
    `${JSON.stringify({ addons: sortedByKey(requested.addons) }, null, 4)}\n`;

/** `addons.lock.json` as the server writes it: keys sorted, four-space indented, ending in a newline. */
export const serializeAddonsLockFile = (lock: AddonsLockFile): string =>
    `${JSON.stringify({ lockfileVersion: lock.lockfileVersion, addons: sortedByKey(lock.addons) }, null, 4)}\n`;

/** Writes a file through a temporary one beside it, so a reader sees the old text or the new. */
const writeAtomically = async (file: string, text: string): Promise<void> => {
    const temporary = path.join(path.dirname(file), `.${path.basename(file)}.${randomUUID()}.tmp`);
    try {
        await writeFile(temporary, text, { flag: 'wx' });
        await rename(temporary, file);
    } finally {
        await rm(temporary, { force: true });
    }
};

/**
 * Writes both files, `addons.json` first. A server stopped between the two writes finds a key
 * that one of them lacks, and the next sync settles it the way the request says.
 */
export const writeAddonFiles = async (
    directory: string,
    requested: AddonsFile,
    lock: AddonsLockFile
): Promise<void> => {
    await writeAtomically(path.join(directory, ADDONS_FILE), serializeAddonsFile(requested));
    await writeAtomically(path.join(directory, ADDONS_LOCK_FILE), serializeAddonsLockFile(lock));
};
