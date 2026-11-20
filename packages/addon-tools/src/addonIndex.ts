import { AddonToolsErrors } from '@jsprismarine/errors/addon-tools';

import { isRecord } from './isRecord';

/**
 * The index a source publishes beside its packs, `index.json` on its `addons` release: every
 * version of every addon it has published, with where to download each pack and its SHA-256.
 * The build writes it and the server's installer reads it, both through this module.
 */

/** The schema version this module writes and reads. */
export const ADDON_INDEX_SCHEMA_VERSION = 1;

/** The release tag a source publishes its packs and index on. */
export const ADDON_RELEASE_TAG = 'addons';

/** The file name of the index on the release. */
export const ADDON_INDEX_FILE = 'index.json';

/**
 * The name the release workflow gives the old index while it uploads a new one. GitHub deletes
 * an asset before replacing it, so the old index is renamed first; when the upload fails, this
 * file still holds every published version, and the next build merges with it.
 */
export const ADDON_INDEX_BACKUP_FILE = 'index.previous.json';

/** One published version of one addon. */
export interface AddonIndexEntry {
    /** The addon's name: its folder in the source repository and its name in `addon install`. */
    readonly name: string;
    /** The pack's version, `major.minor.patch`, from its manifest header. */
    readonly version: string;
    /** A one-line description of what the addon does. */
    readonly description: string;
    /** The oldest JSPrismarine version the addon runs on, `major.minor.patch`. */
    readonly minServer: string;
    /** Where the `.mcpack` downloads from, an `https:` URL. */
    readonly url: string;
    /** The pack's SHA-256, in lowercase hexadecimal. */
    readonly sha256: string;
}

/** A parsed addon index. */
export interface AddonIndex {
    readonly schemaVersion: typeof ADDON_INDEX_SCHEMA_VERSION;
    /** Every published version, sorted by name and then by version, oldest first. */
    readonly addons: readonly AddonIndexEntry[];
}

const ADDON_NAME = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const VERSION = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/;
const SHA256 = /^[0-9a-f]{64}$/;

/** Whether a name is an addon name: lowercase letters and digits, with single hyphens between. */
export const isAddonName = (name: string): boolean => ADDON_NAME.test(name);

/**
 * Whether a version is `major.minor.patch` with no leading zeros, the form an index uses. Each part
 * must be a safe integer, since versions compare as numbers and two larger parts could read as one.
 */
export const isAddonVersion = (version: string): boolean =>
    VERSION.test(version) && version.split('.').every((part) => Number.isSafeInteger(Number(part)));

/** The file name of an addon's pack on the release: `<name>-<version>.mcpack`. */
export const packFileName = (name: string, version: string): string => `${name}-${version}.mcpack`;

/**
 * Compares two `major.minor.patch` versions.
 * @returns Negative when `a` is older than `b`, zero when they are equal.
 */
export const compareAddonVersions = (a: string, b: string): number => {
    const left = a.split('.').map(Number);
    const right = b.split('.').map(Number);
    return left[0]! - right[0]! || left[1]! - right[1]! || left[2]! - right[2]!;
};

/** A range of versions an installer picks from: `^1.2.3`, `~1.2.3` or an exact `1.2.3`; `*` is read apart. */
const RANGE = /^(\^|~)?(.*)$/;

/** A range's operator and the version it starts from, or undefined for `*` and what is not a range. */
const rangeBase = (range: string): { readonly operator: string | undefined; readonly base: string } | undefined => {
    const match = RANGE.exec(range);
    return match && isAddonVersion(match[2]!) ? { operator: match[1], base: match[2]! } : undefined;
};

/** Whether a string is a version range {@link satisfiesAddonRange} reads. */
export const isAddonRange = (range: string): boolean => range === '*' || rangeBase(range) !== undefined;

/**
 * Whether a version falls in a range, as npm reads the same range:
 *
 * - `1.2.3` matches that version only.
 * - `~1.2.3` matches `1.2.3` and later patches of `1.2`.
 * - `^1.2.3` matches `1.2.3` and anything later with the same major version. Below `1.0.0` the
 *   first non-zero part is the one that stays: `^0.2.3` stops before `0.3.0`, and `^0.0.3`
 *   matches `0.0.3` only.
 * - `*` matches every version.
 *
 * @returns False for a version or a range neither form takes.
 */
export const satisfiesAddonRange = (version: string, range: string): boolean => {
    if (!isAddonVersion(version)) return false;
    if (range === '*') return true;
    const parsed = rangeBase(range);
    if (parsed === undefined) return false;
    const { operator, base } = parsed;
    if (compareAddonVersions(version, base) < 0) return false;
    const [major, minor, patch] = base.split('.').map(Number);
    const [vMajor, vMinor, vPatch] = version.split('.').map(Number);
    if (operator === undefined) return vMajor === major && vMinor === minor && vPatch === patch;
    if (operator === '~') return vMajor === major && vMinor === minor;
    if (major !== 0) return vMajor === major;
    if (minor !== 0) return vMajor === 0 && vMinor === minor;
    return vMajor === 0 && vMinor === 0 && vPatch === patch;
};

/**
 * The versions of one addon an index lists that fall in a range, newest first: the order an
 * installer tries them in.
 */
export const addonVersionsInRange = (index: AddonIndex, name: string, range: string): AddonIndexEntry[] =>
    index.addons.filter((entry) => entry.name === name && satisfiesAddonRange(entry.version, range)).reverse();

const parseEntry = (value: unknown, index: number): AddonIndexEntry => {
    const fail = (problem: string) =>
        new AddonToolsErrors.InvalidAddonIndex({ problem: `addons[${index}] ${problem}` });
    if (!isRecord(value)) throw fail('is not an object');

    const text = (key: keyof AddonIndexEntry): string => {
        const field = value[key];
        if (typeof field !== 'string' || field.length === 0) throw fail(`has no ${key} string`);
        return field;
    };
    const name = text('name');
    if (!isAddonName(name)) throw fail(`has the name ${JSON.stringify(name)}, which is not an addon name`);
    const version = text('version');
    if (!isAddonVersion(version)) throw fail(`has the version ${JSON.stringify(version)}, not major.minor.patch`);
    const minServer = text('minServer');
    if (!isAddonVersion(minServer)) throw fail(`has the minServer ${JSON.stringify(minServer)}, not major.minor.patch`);
    const url = text('url');
    if (!URL.canParse(url) || new URL(url).protocol !== 'https:') throw fail(`has the url ${url}, not an https URL`);
    const sha256 = text('sha256');
    if (!SHA256.test(sha256)) throw fail('has a sha256 that is not 64 lowercase hexadecimal digits');

    return { name, version, description: text('description'), minServer, url, sha256 };
};

/** Sorts entries by name and then by version, oldest first: the order an index keeps. */
const sortEntries = (entries: Iterable<AddonIndexEntry>): AddonIndexEntry[] =>
    [...entries].sort(
        (a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0) || compareAddonVersions(a.version, b.version)
    );

/**
 * Builds an index from entries, sorted the way an index keeps them.
 * @throws {InvalidAddonIndexError} When two entries share a name and a version.
 */
export const createAddonIndex = (entries: Iterable<AddonIndexEntry>): AddonIndex => {
    const addons = sortEntries(entries);
    for (let i = 1; i < addons.length; i++) {
        const { name, version } = addons[i]!;
        if (addons[i - 1]!.name === name && addons[i - 1]!.version === version)
            throw new AddonToolsErrors.InvalidAddonIndex({ problem: `${name} ${version} is listed twice` });
    }
    return { schemaVersion: ADDON_INDEX_SCHEMA_VERSION, addons };
};

/**
 * Validates a decoded `index.json` against the schema. Keys an entry has beyond the schema's are
 * dropped, so an index that gains fields under the same schema version still reads.
 *
 * @param value - The index, as `JSON.parse` returned it.
 * @throws {InvalidAddonIndexError} When the index does not follow the schema, has a schema version
 * other than {@link ADDON_INDEX_SCHEMA_VERSION}, or lists one version of an addon twice.
 */
export const parseAddonIndex = (value: unknown): AddonIndex => {
    if (!isRecord(value)) throw new AddonToolsErrors.InvalidAddonIndex({ problem: 'it is not a JSON object' });
    if (value.schemaVersion !== ADDON_INDEX_SCHEMA_VERSION)
        throw new AddonToolsErrors.UnsupportedAddonIndexVersion({
            schemaVersion: JSON.stringify(value.schemaVersion),
            supported: ADDON_INDEX_SCHEMA_VERSION
        });
    if (!Array.isArray(value.addons))
        throw new AddonToolsErrors.InvalidAddonIndex({ problem: 'addons is not an array' });
    return createAddonIndex(value.addons.map(parseEntry));
};

/** An index as the text of `index.json`: four-space indented, ending in a newline. */
export const serializeAddonIndex = (index: AddonIndex): string => `${JSON.stringify(index, null, 4)}\n`;

/** An index with a build's entries merged in, and which of those it did not list before. */
export interface MergedAddonIndex {
    readonly index: AddonIndex;
    /** The built entries the earlier index did not have, in index order. */
    readonly added: readonly AddonIndexEntry[];
}

/**
 * Merges a build's entries into the index already published. Every published version stays, so a
 * lockfile's URL keeps downloading the pack it hashed; a built version that is already listed must
 * match its hash.
 *
 * @param published - The index on the release, or undefined before the first release.
 * @param built - One entry for each addon the build packed.
 * @throws {InvalidAddonError} `PublishedVersionChanged` when a built pack's version is published
 * with another hash.
 */
export const mergeAddonIndex = (
    published: AddonIndex | undefined,
    built: readonly AddonIndexEntry[]
): MergedAddonIndex => {
    const key = ({ name, version }: AddonIndexEntry) => `${name}@${version}`;
    const entries = new Map((published?.addons ?? []).map((entry) => [key(entry), entry]));
    const added: AddonIndexEntry[] = [];
    for (const entry of built) {
        const existing = entries.get(key(entry));
        if (existing && existing.sha256 !== entry.sha256)
            throw new AddonToolsErrors.PublishedVersionChanged({ name: entry.name, version: entry.version });
        if (existing) continue;
        entries.set(key(entry), entry);
        added.push(entry);
    }
    return { index: createAddonIndex(entries.values()), added: sortEntries(added) };
};
