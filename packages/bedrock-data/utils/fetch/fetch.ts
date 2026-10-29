import { createWriteStream } from 'node:fs';
import { mkdir, readdir, readFile, rename, rm, stat, writeFile } from 'node:fs/promises';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { join } from 'node:path';

import { hashFile } from './hash.ts';
import { hashFolder } from './folder-hash.ts';
import type { SourceDescriptor } from './manifest.ts';
import { extractZip } from './unzip.ts';

/**
 * The minecraft.net CDN resets the HTTP/2 stream for non-browser User-Agents
 * (curl's default, python-requests and Go all fail), so every download sends
 * a browser one. The exact string matters: `Mozilla/5.0` gets a 200 and
 * `Mozilla/5.0 (JSPrismarine data fetch)` gets a stream reset, measured
 * against bin-linux on 2026-10-24. See docs/research/bedrock-data-extraction.md.
 */
export const DOWNLOAD_USER_AGENT = 'Mozilla/5.0';

const MARKER_FILE = '.jsp-fetch.json';
const UNPACKED_DIR = 'unpacked';

/** How the fetch talks to the network and the environment; tests stub both. */
export interface FetchOptions {
    /** Cache root the `<source>/<version>` directories are created under. */
    cacheRoot: string;
    /** Environment the override variables are read from. Defaults to `process.env`. */
    env?: Record<string, string | undefined>;
    /** Download function. Defaults to the global `fetch`. */
    fetchImpl?: typeof fetch;
}

/** Where a source's verified content ended up. */
export interface FetchedSource {
    descriptor: SourceDescriptor;
    /**
     * Directory with the source's content: the unpacked archive, or the
     * directory containing the downloaded file. For an env override, the
     * override path's directory semantics apply unchanged.
     */
    contentPath: string;
    /** True when an environment override supplied the content. */
    fromOverride: boolean;
    /** True when the verified content was already cached and nothing was downloaded. */
    fromCache: boolean;
}

interface FetchMarker {
    url: string;
    algorithm: string;
    hash: string;
    /** The allowlist the cached content was unpacked with, when there was one. */
    extract?: string[];
}

/** Whether a cache marker was written by the same pin and the same allowlist. */
const markerMatches = (marker: FetchMarker | undefined, descriptor: SourceDescriptor): boolean =>
    marker?.url === descriptor.url &&
    marker.hash === descriptor.hash.value &&
    (marker.extract ?? []).join('\u0000') === (descriptor.extract ?? []).join('\u0000');

const readMarker = async (markerPath: string): Promise<FetchMarker | undefined> => {
    try {
        // The marker is JSON this module wrote; parse gives it no type.
        return JSON.parse(await readFile(markerPath, 'utf8')) as FetchMarker;
    } catch {
        return undefined;
    }
};

const download = async (url: string, destination: string, fetchImpl: typeof fetch): Promise<void> => {
    const response = await fetchImpl(url, { headers: { 'user-agent': DOWNLOAD_USER_AGENT }, redirect: 'follow' });
    if (!response.ok || response.body === null) {
        throw new Error(`Download failed for ${url}: HTTP ${response.status}`);
    }
    await pipeline(Readable.fromWeb(response.body), createWriteStream(destination));
};

/**
 * Turns a descriptor's extract allowlist into an entry filter. The names in
 * the allowlist are relative to a GitHub archive's `<repo>-<commit>/` wrapper
 * directory, so the filter drops the first path segment before comparing.
 */
const allowlistFilter = (extract: string[] | undefined): ((name: string) => boolean) => {
    if (extract === undefined) return () => true;
    const wanted = new Set(extract);
    return (name) => wanted.has(name.split('/').slice(1).join('/'));
};

/**
 * Ensures one pinned source is present and verified in the cache.
 *
 * Resolution order: the source's environment override wins and is returned
 * as-is; a cache entry whose marker records the pinned digest is a no-op;
 * otherwise the source is downloaded, its digest checked against the
 * manifest before anything unpacks, zips extracted into their own
 * directory, and a marker written so the next run is a no-op.
 *
 * @throws Error when the override path does not exist, the download fails,
 * or the digest does not match the manifest.
 */
export const fetchSource = async (descriptor: SourceDescriptor, options: FetchOptions): Promise<FetchedSource> => {
    const env = options.env ?? process.env;
    const fetchImpl = options.fetchImpl ?? fetch;

    const override = env[descriptor.envOverride];
    if (override !== undefined && override !== '') {
        await stat(override);
        return { descriptor, contentPath: override, fromOverride: true, fromCache: false };
    }

    const versionDir = join(options.cacheRoot, descriptor.name, descriptor.version);
    const archivePath = join(versionDir, descriptor.fileName);
    const contentPath = descriptor.unpack ? join(versionDir, UNPACKED_DIR) : versionDir;
    const markerPath = join(versionDir, MARKER_FILE);

    const marker = await readMarker(markerPath);
    if (markerMatches(marker, descriptor)) {
        return { descriptor, contentPath, fromOverride: false, fromCache: true };
    }

    await mkdir(versionDir, { recursive: true });
    const partPath = `${archivePath}.part`;
    await download(descriptor.url, partPath, fetchImpl);

    const actual = await hashFile(partPath, descriptor.hash.algorithm);
    if (actual !== descriptor.hash.value) {
        await rm(partPath, { force: true });
        throw new Error(
            `${descriptor.hash.algorithm} mismatch for ${descriptor.name} ${descriptor.version}: ` +
                `expected ${descriptor.hash.value}, got ${actual}`
        );
    }
    await rename(partPath, archivePath);

    if (descriptor.unpack) {
        await rm(contentPath, { recursive: true, force: true });
        await extractZip(archivePath, contentPath, allowlistFilter(descriptor.extract));
    }

    const written: FetchMarker = {
        url: descriptor.url,
        algorithm: descriptor.hash.algorithm,
        hash: descriptor.hash.value,
        ...(descriptor.extract === undefined ? {} : { extract: descriptor.extract })
    };
    await writeFile(markerPath, `${JSON.stringify(written, undefined, 4)}\n`);
    return { descriptor, contentPath, fromOverride: false, fromCache: false };
};

/**
 * Steps into a GitHub archive's single wrapper directory (`<repo>-<commit>/`)
 * when the content directory contains exactly one directory and nothing else;
 * returns the directory unchanged otherwise.
 */
export const resolveContentRoot = async (contentPath: string): Promise<string> => {
    const entries = await readdir(contentPath, { withFileTypes: true });
    const visible = entries.filter((entry) => entry.name !== MARKER_FILE);
    if (visible.length === 1 && visible[0].isDirectory()) {
        return join(contentPath, visible[0].name);
    }
    return contentPath;
};

/** One source's section of `pack-hashes.json`. */
export interface SourcePackHashes {
    version: string;
    /**
     * sha256 per top-level entry of the source's content root: directories
     * use the folder digest, regular files their content digest.
     */
    entries: Record<string, string>;
}

/**
 * Hashes each top-level folder and file of a fetched source so a version
 * bump shows which folders changed. The digests are what
 * `pack-hashes.json` records per source.
 */
export const hashSourceContent = async (fetched: FetchedSource): Promise<SourcePackHashes> => {
    const contentStat = await stat(fetched.contentPath);
    if (contentStat.isFile()) {
        // An env override may point straight at a file, such as the Java server jar.
        const name = fetched.contentPath.split(/[\\/]/).at(-1) ?? fetched.contentPath;
        return {
            version: fetched.descriptor.version,
            entries: { [name]: await hashFile(fetched.contentPath, 'sha256') }
        };
    }
    const root = await resolveContentRoot(fetched.contentPath);
    const entries: Record<string, string> = {};
    const listing = await readdir(root, { withFileTypes: true });
    const named = listing
        .filter((entry) => entry.name !== MARKER_FILE && !entry.name.endsWith('.part'))
        .sort((a, b) => (a.name < b.name ? -1 : 1));
    for (const entry of named) {
        if (entry.isDirectory()) {
            entries[entry.name] = await hashFolder(join(root, entry.name));
        } else if (entry.isFile()) {
            entries[entry.name] = await hashFile(join(root, entry.name), 'sha256');
        }
    }
    return { version: fetched.descriptor.version, entries };
};
