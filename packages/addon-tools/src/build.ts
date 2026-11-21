import { mkdir, readdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

import { AddonToolsErrors } from '@jsprismarine/errors/addon-tools';

import type { Addon } from './addon';
import { addonIndexEntry, addonListingFiles, listingFileList, packAddon, readAddon } from './addon';
import type { AddonIndex, AddonIndexEntry } from './addonIndex';
import { fileUrl } from './url';
import {
    ADDON_INDEX_BACKUP_FILE,
    ADDON_INDEX_FILE,
    ADDON_RELEASE_TAG,
    mergeAddonIndex,
    parseAddonIndex,
    serializeAddonIndex
} from './addonIndex';

/**
 * Where a GitHub repository's addon release serves its files from.
 * @param repository - `<owner>/<repo>`.
 */
export const releaseDownloadUrl = (repository: string): string =>
    `https://github.com/${repository}/releases/download/${ADDON_RELEASE_TAG}`;

/** Downloads one of a release's index files, or undefined when the release does not have it. */
const fetchIndexFile = async (url: string, fetcher: typeof fetch): Promise<AddonIndex | undefined> => {
    let response: Response;
    try {
        response = await fetcher(url);
    } catch (cause) {
        throw new AddonToolsErrors.PublishedIndexUnavailable({ url, status: 'no response' }, { cause });
    }
    if (response.status === 404) return undefined;
    if (!response.ok) throw new AddonToolsErrors.PublishedIndexUnavailable({ url, status: response.status });

    let value: unknown;
    try {
        value = await response.json();
    } catch (cause) {
        throw new AddonToolsErrors.InvalidAddonIndex({ problem: `${url} is not JSON` }, { cause });
    }
    return parseAddonIndex(value);
};

/**
 * Downloads the index a release publishes. When the release has no `index.json` but has the
 * {@link ADDON_INDEX_BACKUP_FILE} a failed upload left, it reads that instead, so a build after
 * the failure keeps every published version.
 *
 * @param baseUrl - Where the release's files download from, as {@link releaseDownloadUrl} gives.
 * @param fetcher - What downloads it; the global `fetch` unless a caller routes requests itself.
 * @returns The index, or undefined when the release has neither file yet.
 * @throws {InvalidAddonIndexError} When the index does not follow the schema.
 */
export const fetchPublishedIndex = async (
    baseUrl: string,
    fetcher: typeof fetch = fetch
): Promise<AddonIndex | undefined> =>
    (await fetchIndexFile(fileUrl(baseUrl, ADDON_INDEX_FILE), fetcher)) ??
    (await fetchIndexFile(fileUrl(baseUrl, ADDON_INDEX_BACKUP_FILE), fetcher));

/** Options for {@link buildAddons}. */
export interface BuildAddonsOptions {
    /** The folder that holds one folder per addon. */
    readonly addonsDirectory: string;
    /** Where the packs and `index.json` are written. */
    readonly outDirectory: string;
    /** Where the release serves its files from, an `https:` URL. */
    readonly baseUrl: string;
    /** The index already published, merged with the build's entries; none before a first release. */
    readonly published?: AddonIndex;
}

/** What {@link buildAddons} wrote. */
export interface BuildAddonsResult {
    /** The index written to `index.json`: the published one plus every addon built. */
    readonly index: AddonIndex;
    /** One entry for each addon built, in name order. */
    readonly built: readonly AddonIndexEntry[];
    /** The built entries the published index lacks: the packs a release has to upload. */
    readonly added: readonly AddonIndexEntry[];
    /** The listing files of the added entries, in index order: what a release uploads beside their packs. */
    readonly addedListingFiles: readonly string[];
}

/**
 * Reads and checks every addon in a folder with `readAddon`, in name order. Every folder directly
 * under `addonsDirectory` is an addon, except those whose names start with a dot; files there,
 * such as a README, are skipped.
 *
 * @throws {InvalidAddonError} When an addon is invalid.
 */
export const readAddons = async (addonsDirectory: string): Promise<Addon[]> => {
    const folders = (await readdir(addonsDirectory, { withFileTypes: true }))
        .filter((entry) => entry.isDirectory() && !entry.name.startsWith('.'))
        .map((entry) => entry.name)
        .sort();
    const addons: Addon[] = [];
    for (const folder of folders) addons.push(await readAddon(path.join(addonsDirectory, folder)));
    return addons;
};

/**
 * Builds every addon in a folder: reads them with {@link readAddons}, merges their entries into the
 * published index, then writes each pack into the output folder as `<name>-<version>.mcpack`, its
 * listing files beside it, and `index.json`. A build it refuses writes nothing, so the output folder
 * keeps the last good build.
 *
 * @throws {InvalidAddonError} When an addon is invalid, or a built version is published with
 * other contents.
 * @throws {TypeError} `InvalidBaseUrl` when the base URL is not an `https:` URL.
 */
export const buildAddons = async (options: BuildAddonsOptions): Promise<BuildAddonsResult> => {
    const { addonsDirectory, outDirectory, baseUrl, published } = options;
    if (!URL.canParse(baseUrl) || new URL(baseUrl).protocol !== 'https:')
        throw new AddonToolsErrors.InvalidBaseUrl({ url: baseUrl });

    const packs = (await readAddons(addonsDirectory)).map((addon) => ({
        addon,
        pack: packAddon(addon),
        listing: listingFileList(addonListingFiles(addon))
    }));
    const built = packs.map(({ addon, pack }) => addonIndexEntry(addon, pack, baseUrl));
    const { index, added } = mergeAddonIndex(published, built);

    await mkdir(outDirectory, { recursive: true });
    for (const { pack, listing } of packs) {
        await writeFile(path.join(outDirectory, pack.fileName), pack.bytes);
        for (const file of listing) await writeFile(path.join(outDirectory, file.fileName), file.bytes);
    }
    await writeFile(path.join(outDirectory, ADDON_INDEX_FILE), serializeAddonIndex(index));

    const addedKeys = new Set(added.map(({ name, version }) => `${name}@${version}`));
    const addedListingFiles = packs
        .filter(({ addon }) => addedKeys.has(`${addon.name}@${addon.version}`))
        .flatMap(({ listing }) => listing.map((file) => file.fileName));
    return { index, built, added, addedListingFiles };
};
