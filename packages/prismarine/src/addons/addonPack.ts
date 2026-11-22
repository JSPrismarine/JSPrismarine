/**
 * An addon's pack on disk: downloading it, checking what it holds and unpacking it into its
 * folder under `addons/`.
 */
import { createHash } from 'node:crypto';
import { lstat, mkdir, readdir, readFile, rename, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';

import { ADDON_MODULE_TYPES, parseAddonMetadata } from '@jsprismarine/addon-tools/addon';
import { compareAddonVersions, isAddonVersion } from '@jsprismarine/addon-tools/addonIndex';
import { PrismarineAddonErrors } from '@jsprismarine/errors/prismarine/addon';
import { isJSPrismarineError } from '@jsprismarine/errors/JSPrismarineError';
import { parseLenientJson } from '@jsprismarine/packs/lenientJson';
import { parseManifest } from '@jsprismarine/packs/manifest';
import { readZip } from '@jsprismarine/packs/zip';

import { isHttpsUrl } from './addonFiles';

/**
 * What a pack may hold and still load without a restart: the manifest, the addon's own files and
 * its scripts. Anything else, such as `entities/` or `items/`, joins the content build, which runs
 * at startup.
 */
const LOADS_WITHOUT_RESTART =
    /^(?:manifest\.json|addon\.json|pack_icon\.png|readme(?:\.[a-z]+)?|license(?:\.[a-z]+)?|scripts|texts)$/i;

/** A pack's SHA-256, in lowercase hexadecimal. */
export const sha256Of = (bytes: Uint8Array): string => createHash('sha256').update(bytes).digest('hex');

/** The most bytes an addon's pack may have; a download stops once it passes this. */
export const MAX_ADDON_PACK_BYTES = 128 * 1024 * 1024;

/** How long one request may take, its redirects and its body included, before it fails. */
export const ADDON_REQUEST_TIMEOUT_MS = 120_000;

/** How many redirects a request follows before it fails. */
const MAX_REDIRECTS = 10;

/** A thrown value's message, for one line of the console or an error's status. */
export const messageOf = (error: unknown): string => (error instanceof Error ? error.message : String(error));

/**
 * Wraps a fetch so every request the installer makes, for an index or a pack, stays on `https:`
 * and ends in time. It follows redirects itself and refuses one to another scheme, since the
 * default fetch would follow an `https:` URL to `http:`. One deadline covers every hop and the
 * body, so a server that keeps sending a few bytes cannot hold up a startup sync.
 *
 * @param timeoutMs - The deadline of one request.
 */
export const httpsFetch =
    (fetcher: typeof fetch, timeoutMs: number = ADDON_REQUEST_TIMEOUT_MS): typeof fetch =>
    async (input, init) => {
        const signal = AbortSignal.timeout(timeoutMs);
        let url = input instanceof Request ? input.url : String(input);
        for (let hops = 0; ; hops++) {
            if (!isHttpsUrl(url))
                throw new PrismarineAddonErrors.AddonDownloadFailed({ url, status: 'it is not an https URL' });
            const response = await fetcher(url, { ...init, redirect: 'manual', signal });
            const location = response.headers.get('location');
            if (response.status < 300 || response.status >= 400 || location === null) return response;
            await response.body?.cancel();
            if (hops === MAX_REDIRECTS)
                throw new PrismarineAddonErrors.AddonDownloadFailed({ url, status: 'it redirects too many times' });
            url = new URL(location, url).href;
        }
    };

/**
 * Reads a response's body, stopping once it passes `maxBytes`.
 * @throws {PrismarineAddonErrors.AddonTooLarge} When the body is larger.
 */
const readBounded = async (url: string, response: Response, maxBytes: number): Promise<Uint8Array> => {
    const tooLarge = () => new PrismarineAddonErrors.AddonTooLarge({ url, limit: maxBytes });
    if (Number(response.headers.get('content-length')) > maxBytes) {
        await response.body?.cancel();
        throw tooLarge();
    }
    if (response.body === null) return new Uint8Array();
    const reader = response.body.getReader();
    const chunks: Uint8Array[] = [];
    let total = 0;
    for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        total += value.byteLength;
        if (total > maxBytes) {
            await reader.cancel();
            throw tooLarge();
        }
        chunks.push(value);
    }
    const bytes = new Uint8Array(total);
    let offset = 0;
    for (const chunk of chunks) {
        bytes.set(chunk, offset);
        offset += chunk.byteLength;
    }
    return bytes;
};

/**
 * Downloads a pack.
 * @param maxBytes - The largest pack it reads; {@link MAX_ADDON_PACK_BYTES} by default.
 * @throws {PrismarineAddonErrors.AddonDownloadFailed} When the server does not answer with the file.
 * @throws {PrismarineAddonErrors.AddonTooLarge} When the file is larger than `maxBytes`.
 */
export const downloadPack = async (
    fetcher: typeof fetch,
    url: string,
    maxBytes: number = MAX_ADDON_PACK_BYTES
): Promise<Uint8Array> => {
    let response: Response;
    try {
        response = await fetcher(url);
    } catch (cause) {
        if (isJSPrismarineError(cause)) throw cause;
        throw new PrismarineAddonErrors.AddonDownloadFailed(
            { url, status: `no response: ${messageOf(cause)}` },
            { cause }
        );
    }
    if (!response.ok) {
        await response.body?.cancel();
        throw new PrismarineAddonErrors.AddonDownloadFailed({ url, status: response.status });
    }
    try {
        return await readBounded(url, response, maxBytes);
    } catch (cause) {
        if (isJSPrismarineError(cause)) throw cause;
        throw new PrismarineAddonErrors.AddonDownloadFailed(
            { url, status: `the download stopped: ${messageOf(cause)}` },
            { cause }
        );
    }
};

/**
 * The files of an `.mcpack`, by their path inside the addon. A pack zipped with its folder, so
 * that `manifest.json` sits under one top-level folder, is read from inside that folder.
 *
 * @throws {PrismarineAddonErrors.InvalidAddonPack} When the archive does not read, has no
 * manifest, or names a path that would land outside the addon's folder.
 */
export const unpackPack = (key: string, bytes: Uint8Array): Map<string, Uint8Array> => {
    const fail = (problem: string) => new PrismarineAddonErrors.InvalidAddonPack({ key, problem });
    let entries: Map<string, Uint8Array>;
    try {
        entries = readZip(bytes);
    } catch (cause) {
        if (isJSPrismarineError(cause))
            throw new PrismarineAddonErrors.InvalidAddonPack({ key, problem: cause.message }, { cause });
        throw cause;
    }
    // Each name must have one spelling on disk: no `.` or empty segment, so `./manifest.json`
    // cannot overwrite the `manifest.json` that was checked, and no two names that differ only in
    // case, which are one file on Windows and macOS.
    const seen = new Set<string>();
    for (const name of entries.keys()) {
        const parts = (name.endsWith('/') ? name.slice(0, -1) : name).split('/');
        if (name.startsWith('/') || name.includes('\\') || /^[A-Za-z]:/.test(name) || parts.includes('..'))
            throw fail(`${name} would land outside the addon's folder`);
        if (parts.includes('.') || parts.includes('')) throw fail(`${name} is not a plain path`);
        const folded = name.toLowerCase();
        if (seen.has(folded)) throw fail(`${name} names a file another entry already names`);
        seen.add(folded);
    }
    if (entries.has('manifest.json')) return entries;

    const roots = new Set([...entries.keys()].map((name) => name.split('/')[0]!));
    const [root] = roots;
    if (roots.size !== 1 || !entries.has(`${root}/manifest.json`)) throw fail('it has no manifest.json');
    return new Map([...entries].map(([name, data]) => [name.slice(root!.length + 1), data]));
};

/** What an installer reads off a pack before it trusts it. */
export interface PackSummary {
    /** The manifest header's version, `major.minor.patch`. */
    readonly version: string;
    /** What `addon.json` says the addon needs, when the pack has one. */
    readonly minServer?: string;
    /** The pack's top-level entries that only load at startup, such as `entities`, in name order. */
    readonly needsRestart: readonly string[];
}

/**
 * Checks a pack is a behavior pack and reads its version, its `minServer` and what in it needs a
 * restart.
 *
 * @param key - The addon's local name, for the error messages.
 * @param file - Reads one file at the pack's root, or undefined when it has none.
 * @param topLevel - The names at the pack's root.
 * @throws {PrismarineAddonErrors.InvalidAddonPack} When the manifest is missing or not a behavior pack's.
 * @throws {InvalidAddonError} `InvalidAddonJson` when the pack has an `addon.json` that breaks its format.
 */
const summarize = (
    key: string,
    file: (name: string) => Uint8Array | undefined,
    topLevel: readonly string[]
): PackSummary => {
    const fail = (problem: string) => new PrismarineAddonErrors.InvalidAddonPack({ key, problem });
    const manifestBytes = file('manifest.json');
    if (manifestBytes === undefined) throw fail('it has no manifest.json');
    const text = new TextDecoder().decode(manifestBytes);
    let value: unknown;
    try {
        value = parseLenientJson(text);
    } catch (cause) {
        if (isJSPrismarineError(cause))
            throw new PrismarineAddonErrors.InvalidAddonPack({ key, problem: cause.message }, { cause });
        throw cause;
    }
    const { manifest, diagnostics } = parseManifest(value, key);
    if (!manifest) throw fail(diagnostics.map(({ message }) => message).join('; '));
    const other = manifest.modules.find(({ type }) => !ADDON_MODULE_TYPES.includes(type));
    if (other) throw fail(`it has a ${other.type} module, and an addon has data and script modules only`);
    // The script host reads a script pack's manifest with JSON.parse, which has no comments or
    // trailing commas, so a manifest that only the lenient reader accepts would install and then
    // fail to load.
    if (manifest.modules.some(({ type }) => type === 'script')) {
        try {
            JSON.parse(text);
        } catch (cause) {
            throw new PrismarineAddonErrors.InvalidAddonPack(
                { key, problem: `a script pack's manifest.json must be plain JSON: ${messageOf(cause)}` },
                { cause }
            );
        }
    }
    // parseManifest reads a bare number such as 1.2 as [1.2, 0, 0], which no lock accepts.
    const version = manifest.header.version.join('.');
    if (!isAddonVersion(version)) throw fail(`its header's version, ${version}, is not three whole numbers`);

    const metadata = file('addon.json');
    const needsRestart = topLevel.filter((name) => !LOADS_WITHOUT_RESTART.test(name)).sort();
    return {
        version,
        ...(metadata === undefined ? {} : { minServer: parseAddonMetadata(key, metadata).minServer }),
        needsRestart
    };
};

/** {@link summarize} for a pack's files in memory. */
export const summarizeFiles = (key: string, files: ReadonlyMap<string, Uint8Array>): PackSummary =>
    summarize(key, (name) => files.get(name), [...new Set([...files.keys()].map((name) => name.split('/')[0]!))]);

/** {@link summarize} for a pack's folder on disk. */
export const summarizeFolder = async (key: string, directory: string): Promise<PackSummary> => {
    const topLevel = await readdir(directory);
    const read = async (name: string) =>
        topLevel.includes(name) ? new Uint8Array(await readFile(path.join(directory, name))) : undefined;
    const manifest = await read('manifest.json');
    const metadata = await read('addon.json');
    return summarize(
        key,
        (name) => (name === 'manifest.json' ? manifest : name === 'addon.json' ? metadata : undefined),
        topLevel
    );
};

/**
 * The version of JSPrismarine a server version is, `major.minor.patch`, without a pre-release
 * or build suffix such as a nightly's.
 */
export const releaseOf = (serverVersion: string): string => /^\d+\.\d+\.\d+/.exec(serverVersion)?.[0] ?? '0.0.0';

/** Whether a server of a version runs an addon that needs `minServer`. */
export const serverMeets = (serverVersion: string, minServer: string): boolean =>
    compareAddonVersions(releaseOf(serverVersion), minServer) >= 0;

/** The folder beside an addon's that holds the old one while a new one moves in. */
const previousOf = (target: string): string => path.join(path.dirname(target), `.${path.basename(target)}.previous`);

/**
 * Puts back an addon's old folder that an interrupted replacement left beside it, so nothing
 * deletes the only copy. It does nothing when the addon's folder is there.
 */
export const recoverAddonFolder = async (target: string): Promise<void> => {
    const previous = previousOf(target);
    if ((await lstat(target).catch(() => undefined)) !== undefined) return;
    if ((await lstat(previous).catch(() => undefined)) === undefined) return;
    await rename(previous, target);
};

/** The old folder a replacement moved aside and could not delete. */
export interface PackFolderLeftover {
    readonly path: string;
    /** Why the deletion failed. */
    readonly reason: string;
}

/**
 * Writes a pack's files into the addon's folder, replacing what was there. The files go into a
 * folder beside it first and are moved in by renames, so a failed write leaves the old addon. When
 * the last rename fails, the old folder moves back; when that fails too, it stays beside the
 * addon's folder, and the next replacement puts it back before it deletes anything.
 *
 * @returns The old folder when the new one is in place but the old one could not be deleted; the
 *   replacement still counts, and the next one tries the deletion again. Undefined otherwise.
 */
export const writePackFolder = async (
    target: string,
    files: ReadonlyMap<string, Uint8Array>
): Promise<PackFolderLeftover | undefined> => {
    const staging = path.join(path.dirname(target), `.${path.basename(target)}.installing`);
    const previous = previousOf(target);
    await recoverAddonFolder(target);
    await rm(staging, { recursive: true, force: true });
    try {
        for (const [name, data] of files) {
            if (name === '' || name.endsWith('/')) continue;
            const file = path.join(staging, ...name.split('/'));
            await mkdir(path.dirname(file), { recursive: true });
            await writeFile(file, data);
        }
        await mkdir(staging, { recursive: true });
        await rm(previous, { recursive: true, force: true });
        await removeAddonFolder(target, previous);
        try {
            await rename(staging, target);
        } catch (error: unknown) {
            await recoverAddonFolder(target);
            throw error;
        }
        try {
            await rm(previous, { recursive: true, force: true });
        } catch (error: unknown) {
            return { path: previous, reason: messageOf(error) };
        }
        return undefined;
    } finally {
        await rm(staging, { recursive: true, force: true });
    }
};

/**
 * Takes an addon's folder away: moves it to `previous` when one is given, or deletes it. A folder
 * linked to one elsewhere loses the link only, never the folder it points at.
 */
export const removeAddonFolder = async (target: string, previous?: string): Promise<void> => {
    try {
        if (previous === undefined) await rm(target, { recursive: true });
        else await rename(target, previous);
    } catch (error: unknown) {
        if (error instanceof Error && 'code' in error && error.code === 'ENOENT') return;
        throw error;
    }
};
