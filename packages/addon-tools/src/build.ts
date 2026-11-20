import { mkdir, readdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

import { AddonToolsErrors } from '@jsprismarine/errors/addon-tools';

import { addonIndexEntry, packAddon, readAddon } from './addon';
import type { AddonIndex, AddonIndexEntry } from './addonIndex';
import {
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

/**
 * Downloads the index a release publishes.
 * @param baseUrl - Where the release's files download from, as {@link releaseDownloadUrl} gives.
 * @param fetcher - What downloads it; the global `fetch` unless a caller routes requests itself.
 * @returns The index, or undefined when the release has none yet.
 * @throws {InvalidAddonIndexError} When the index does not follow the schema.
 */
export const fetchPublishedIndex = async (
    baseUrl: string,
    fetcher: typeof fetch = fetch
): Promise<AddonIndex | undefined> => {
    const url = `${baseUrl.replace(/\/+$/, '')}/${ADDON_INDEX_FILE}`;
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
}

/**
 * Builds every addon in a folder: checks each with `readAddon`, writes its pack into the output
 * folder as `<name>-<version>.mcpack`, and writes `index.json` beside the packs. Every folder
 * directly under `addonsDirectory` is an addon, except those whose names start with a dot; files
 * there, such as a README, are skipped.
 *
 * @throws {InvalidAddonError} When an addon is invalid, or a built version is published with
 * other contents.
 * @throws {TypeError} `InvalidBaseUrl` when the base URL is not an `https:` URL.
 */
export const buildAddons = async (options: BuildAddonsOptions): Promise<BuildAddonsResult> => {
    const { addonsDirectory, outDirectory, baseUrl, published } = options;
    if (!URL.canParse(baseUrl) || new URL(baseUrl).protocol !== 'https:')
        throw new AddonToolsErrors.InvalidBaseUrl({ url: baseUrl });

    const folders = (await readdir(addonsDirectory, { withFileTypes: true }))
        .filter((entry) => entry.isDirectory() && !entry.name.startsWith('.'))
        .map((entry) => entry.name)
        .sort();

    await mkdir(outDirectory, { recursive: true });
    const built: AddonIndexEntry[] = [];
    for (const folder of folders) {
        const addon = await readAddon(path.join(addonsDirectory, folder));
        const pack = packAddon(addon);
        await writeFile(path.join(outDirectory, pack.fileName), pack.bytes);
        built.push(addonIndexEntry(addon, pack, baseUrl));
    }

    const { index, added } = mergeAddonIndex(published, built);
    await writeFile(path.join(outDirectory, ADDON_INDEX_FILE), serializeAddonIndex(index));
    return { index, built, added };
};
