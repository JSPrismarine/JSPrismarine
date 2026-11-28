/**
 * An addon's pack on disk: downloading it, checking what it holds and unpacking it into its
 * folder under `addons/`.
 */
import { createHash } from 'node:crypto';
import { lstat, mkdir, readdir, readFile, rename, rm, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';

import { ADDON_MODULE_TYPES, parseAddonMetadata } from '@jsprismarine/addon-tools/addon';
import { compareAddonVersions, isAddonVersion } from '@jsprismarine/addon-tools/addonIndex';
import { PrismarineAddonErrors } from '@jsprismarine/errors/prismarine/addon';
import { isJSPrismarineError } from '@jsprismarine/errors/JSPrismarineError';
import { parseLenientJson } from '@jsprismarine/packs/lenientJson';
import { parseManifest } from '@jsprismarine/packs/manifest';
import { readContentArchive } from '@jsprismarine/packs/archive';

import { isHttpsUrl } from './addonFiles';
import { isRecord } from '../utils/isRecord';

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

/** What a pack is to the server: a behavior pack runs on it, a resource pack goes to clients. */
export type PackKind = 'behavior' | 'resource';

/** The module types of a resource pack, which the server sends to clients as they join. */
export const RESOURCE_MODULE_TYPES: readonly string[] = ['resources'];

/** One pack an archive holds, and the folder under the addon's it unpacks into. */
export interface ArchivePack {
    /** Where it sat in the archive, such as `resources.mcpack` or `BP/`, for the console. */
    readonly member: string;
    /** Its folder inside the addon's, or `.` when the archive is this one pack. */
    readonly folder: string;
    readonly files: ReadonlyMap<string, Uint8Array>;
}

/** One world an archive holds: an `.mcworld`, or an `.mctemplate`'s world. */
export interface ArchiveWorld {
    /** Where it sat in the archive, such as `map.mcworld`, or an empty string for the archive itself. */
    readonly member: string;
    /** Whether it is a world template, whose manifest has a `world_template` module. */
    readonly template: boolean;
    readonly files: ReadonlyMap<string, Uint8Array>;
}

/** Something in an archive the server does not install, and why. */
export interface SkippedMember {
    readonly member: string;
    readonly reason: string;
}

/** What an archive installs. */
export interface UnpackedArchive {
    /** Every pack, in archive order, the packs of each world after the world's other members. */
    readonly packs: readonly ArchivePack[];
    readonly worlds: readonly ArchiveWorld[];
    readonly skipped: readonly SkippedMember[];
}

/** A file name's extension that makes it a Minecraft Editor project. */
const EDITOR_PROJECT = /\.mcproject$/i;

/**
 * Refuses a Minecraft Editor project, which is a world the Editor opens. The server is no editor,
 * and a project exported from the Editor as an `.mcworld` installs.
 *
 * @param name - The file name or URL path the archive came from.
 * @throws {PrismarineAddonErrors.InvalidAddonPack} When it names an `.mcproject`.
 */
export const refuseEditorProject = (key: string, name: string): void => {
    if (EDITOR_PROJECT.test(name))
        throw new PrismarineAddonErrors.InvalidAddonPack({
            key,
            problem: `${name} is a Minecraft Editor project, which the server does not open; export it from the Editor as an .mcworld and install that`
        });
};

/** A folder name made from an archive member's name: `Furniture BP.mcpack` is `furniture-bp`. */
const folderNameOf = (member: string): string =>
    member
        .replace(/\/$/, '')
        .replace(/\.(?:mcpack|mcworld|mctemplate)$/i, '')
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-|-$/g, '') || 'pack';

/** The manifest a set of files holds, read leniently, or undefined when there is none that reads. */
const manifestOf = (files: ReadonlyMap<string, Uint8Array>): Record<string, unknown> | undefined => {
    const bytes = files.get('manifest.json');
    if (bytes === undefined) return undefined;
    try {
        const manifest = parseLenientJson(new TextDecoder().decode(bytes));
        return isRecord(manifest) ? manifest : undefined;
    } catch {
        return undefined;
    }
};

/** The module types a manifest lists. */
const moduleTypesOf = (manifest: Record<string, unknown> | undefined): string[] =>
    manifest !== undefined && Array.isArray(manifest.modules)
        ? manifest.modules.flatMap((module: unknown) =>
              isRecord(module) && typeof module.type === 'string' ? [module.type] : []
          )
        : [];

/** The header UUIDs a world's `world_behavior_packs.json` or `world_resource_packs.json` turns on. */
const worldPackIds = (files: ReadonlyMap<string, Uint8Array>, name: string): Set<string> | undefined => {
    const bytes = files.get(name);
    if (bytes === undefined) return undefined;
    let value: unknown;
    try {
        value = parseLenientJson(new TextDecoder().decode(bytes));
    } catch {
        return new Set();
    }
    if (!Array.isArray(value)) return new Set();
    return new Set(
        value.flatMap((entry: unknown) =>
            isRecord(entry) && typeof entry.pack_id === 'string' ? [entry.pack_id.toLowerCase()] : []
        )
    );
};

/**
 * The packs a world carries in `behavior_packs/` and `resource_packs/`. A world lists the packs it
 * turns on in `world_behavior_packs.json` and `world_resource_packs.json`, so a pack those files do
 * not name stays out; a world without the file turns on every pack in the folder.
 */
const packsOfWorld = (world: ReadonlyMap<string, Uint8Array>): { member: string; files: Map<string, Uint8Array> }[] => {
    const packs: { member: string; files: Map<string, Uint8Array> }[] = [];
    for (const [folder, list] of [
        ['behavior_packs', 'world_behavior_packs.json'],
        ['resource_packs', 'world_resource_packs.json']
    ] as const) {
        const enabled = worldPackIds(world, list);
        const roots = new Set(
            [...world.keys()]
                .filter((name) => name.startsWith(`${folder}/`) && name.split('/').length > 2)
                .map((name) => name.split('/')[1]!)
        );
        for (const root of [...roots].sort()) {
            const prefix = `${folder}/${root}/`;
            const files = new Map(
                [...world]
                    .filter(([name]) => name.startsWith(prefix))
                    .map(([name, data]) => [name.slice(prefix.length), data])
            );
            const manifest = manifestOf(files);
            if (manifest === undefined) continue;
            const uuid = isRecord(manifest.header) ? manifest.header.uuid : undefined;
            if (enabled !== undefined && !(typeof uuid === 'string' && enabled.has(uuid.toLowerCase()))) continue;
            packs.push({ member: prefix, files });
        }
    }
    return packs;
};

/**
 * What a content archive installs, read with `readContentArchive` so the content build and the
 * installer agree on what an archive holds.
 *
 * An `.mcpack` is one pack, which unpacks into the addon's folder itself. An `.mcaddon` holds
 * several packs and worlds; each pack unpacks into a folder of its own under the addon's, named
 * after its name in the archive, and each world is listed to import. A world's own packs, those
 * its `world_behavior_packs.json` and `world_resource_packs.json` turn on, install beside the
 * archive's. A skin pack, a pack with other modules, or a nested archive that does not read is
 * listed as skipped.
 *
 * @throws {PrismarineAddonErrors.InvalidAddonPack} When the archive does not read, holds no pack
 * and no world, or names a path that would land outside the addon's folder.
 */
export const unpackArchive = (key: string, bytes: Uint8Array): UnpackedArchive => {
    const fail = (problem: string) => new PrismarineAddonErrors.InvalidAddonPack({ key, problem });
    let archive: ReturnType<typeof readContentArchive>;
    try {
        archive = readContentArchive(bytes, { check: (entries) => checkNames(key, entries) });
    } catch (cause) {
        if (isJSPrismarineError(cause) && !(cause instanceof PrismarineAddonErrors.InvalidAddonPack))
            throw new PrismarineAddonErrors.InvalidAddonPack({ key, problem: cause.message }, { cause });
        throw cause;
    }

    const skipped: SkippedMember[] = archive.problems.map(({ name, message }) => ({ member: name, reason: message }));
    const found: { member: string; files: Map<string, Uint8Array> }[] = [];
    const worlds: ArchiveWorld[] = [];
    for (const { name, kind, files } of archive.members) {
        if (kind === 'world') {
            worlds.push({
                member: name,
                template: moduleTypesOf(manifestOf(files)).includes('world_template'),
                files
            });
            found.push(...packsOfWorld(files).map((pack) => ({ ...pack, member: `${name}${pack.member}` })));
            continue;
        }
        const types = moduleTypesOf(manifestOf(files));
        if (types.includes('skin_pack')) {
            skipped.push({ member: name, reason: 'it is a skin pack, which players import themselves' });
            continue;
        }
        found.push({ member: name, files });
    }
    if (found.length === 0 && worlds.length === 0)
        throw fail(
            archive.problems.length > 0
                ? archive.problems.map(({ message }) => message).join('; ')
                : skipped.length > 0
                  ? skipped.map(({ member, reason }) => `${member}: ${reason}`).join('; ')
                  : 'it has no manifest.json or level.dat'
        );

    // A lone pack is the addon's folder, as every addon installed before an archive could hold
    // more than one was; anything more gives each pack a folder of its own.
    const single = found.length === 1 && worlds.length === 0 && found[0]!.member === '';
    const taken = new Set<string>();
    const packs = found.map(({ member, files }) => {
        if (single) return { member, folder: '.', files };
        const base = folderNameOf(member.split('/').filter(Boolean).at(-1) ?? member);
        let folder = base;
        for (let n = 2; taken.has(folder); n++) folder = `${base}-${n}`;
        taken.add(folder);
        return { member: member || 'the archive', folder, files };
    });
    return { packs, worlds, skipped };
};

/**
 * Checks every name in an archive's entries.
 * @throws {PrismarineAddonErrors.InvalidAddonPack} When a name is unsafe.
 */
const checkNames = (key: string, entries: ReadonlyMap<string, Uint8Array>): void => {
    const fail = (problem: string) => new PrismarineAddonErrors.InvalidAddonPack({ key, problem });
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
};

/** A pack this one needs, by its header UUID, as its manifest's `dependencies` list it. */
export interface PackDependency {
    readonly uuid: string;
    readonly version: string;
}

/** What an installer reads off a pack before it trusts it. */
export interface PackSummary {
    readonly kind: PackKind;
    /** The manifest header's name, for the console. */
    readonly name: string;
    /** The manifest header's UUID, in lowercase. */
    readonly uuid: string;
    /** The manifest header's version, `major.minor.patch`. */
    readonly version: string;
    /** What `addon.json` says the addon needs, when the pack has one. */
    readonly minServer?: string;
    /** The pack's top-level entries that only load at startup, such as `entities`, in name order. */
    readonly needsRestart: readonly string[];
    /** The other packs it needs. */
    readonly dependencies: readonly PackDependency[];
    /**
     * Whether its manifest's `metadata.product_type` is `addon`. A Bedrock Dedicated Server offers
     * such a resource pack to clients as an addon pack, which a client applies though the behavior
     * pack the resource pack depends on stays on the server.
     */
    readonly addon: boolean;
}

/**
 * Checks a pack is a behavior or a resource pack and reads its identity, its `minServer` and what
 * in it needs a restart.
 *
 * @param key - The addon's local name, for the error messages.
 * @param file - Reads one file at the pack's root, or undefined when it has none.
 * @param topLevel - The names at the pack's root.
 * @throws {PrismarineAddonErrors.InvalidAddonPack} When the manifest is missing, does not read, or
 *   lists modules of neither kind or of both.
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
    const name = manifest.header.name;
    const kind: PackKind | undefined = manifest.modules.every(({ type }) => ADDON_MODULE_TYPES.includes(type))
        ? 'behavior'
        : manifest.modules.every(({ type }) => RESOURCE_MODULE_TYPES.includes(type))
          ? 'resource'
          : undefined;
    if (kind === undefined)
        throw fail(
            `${name} has ${manifest.modules.map(({ type }) => type).join(', ')} modules, and a pack has data and script modules, or resources modules`
        );
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
    if (!isAddonVersion(version)) throw fail(`${name}'s header version, ${version}, is not three whole numbers`);

    // A resource pack's files all reach a client, which reads them when it joins.
    const metadata = kind === 'behavior' ? file('addon.json') : undefined;
    const needsRestart =
        kind === 'behavior' ? topLevel.filter((entry) => !LOADS_WITHOUT_RESTART.test(entry)).sort() : [];
    return {
        kind,
        name,
        uuid: manifest.header.uuid.toLowerCase(),
        version,
        ...(metadata === undefined ? {} : { minServer: parseAddonMetadata(key, metadata).minServer }),
        needsRestart,
        dependencies: manifest.dependencies.map((dependency) => ({
            uuid: dependency.uuid.toLowerCase(),
            version: dependency.version.join('.')
        })),
        addon: manifest.productType === 'addon'
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

/** One pack in an installed addon's folder. */
export interface InstalledPack {
    /** Its folder inside the addon's, or `.` when the addon's folder is the pack. */
    readonly folder: string;
    /** Its folder on disk. */
    readonly directory: string;
    readonly summary: PackSummary;
}

/**
 * The packs an addon's folder holds: the folder itself when it has a `manifest.json`, or each
 * folder inside it that has one, in name order. A pack that does not read is left out.
 */
export const readInstalledPacks = async (key: string, directory: string): Promise<InstalledPack[]> => {
    const entries = await readdir(directory, { withFileTypes: true }).catch(() => undefined);
    if (entries === undefined) return [];
    const tryRead = async (folder: string, at: string): Promise<InstalledPack[]> => {
        try {
            return [{ folder, directory: at, summary: await summarizeFolder(key, at) }];
        } catch {
            return [];
        }
    };
    if (entries.some((entry) => entry.name === 'manifest.json')) return tryRead('.', directory);
    const packs: InstalledPack[] = [];
    for (const entry of entries
        .filter((each) => !each.name.startsWith('.'))
        .sort((a, b) => (a.name < b.name ? -1 : 1))) {
        const at = path.join(directory, entry.name);
        if ((await stat(at).catch(() => undefined))?.isDirectory()) packs.push(...(await tryRead(entry.name, at)));
    }
    return packs;
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
