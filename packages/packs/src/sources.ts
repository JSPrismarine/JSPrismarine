import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative, sep } from 'node:path';

import { readBrarchive } from './brarchive';
import type { Diagnostic } from './diagnostics';
import { compareVersions, parseVersion } from './formatVersion';
import { parseLenientJson } from './lenientJson';
import { isZip, readZip } from './zip';

/**
 * The header UUID of Mojang's vanilla Bedrock behavior pack.
 *
 * A Bedrock pack's identity is its header UUID, not its folder name: every
 * world references the packs it runs by UUID, so Mojang cannot change this
 * one without orphaning every saved world, and it has been the same value
 * across every release this project reads. The BDS `behavior_packs` folder
 * keeps one folder per version of it - `vanilla`, `vanilla_1.14`, ... - and
 * all of them carry this UUID, which is what makes them layers of one pack
 * rather than packs of their own.
 */
export const VANILLA_BEHAVIOR_PACK_UUID = 'fe9f8597-5454-481a-8730-8d070a8e2e58';

/** A Bedrock pack source: definitions keyed by identifier, later pack wins whole. */
export type BedrockPackSource =
    /** A loose pack folder with `manifest.json` at its root. */
    | { kind: 'directory'; path: string }
    /** A `.mcpack` (one pack) or `.mcaddon` (several `.mcpack` members). */
    | { kind: 'archive'; path: string }
    /**
     * A folder of layered pack folders the way BDS ships vanilla: `vanilla`,
     * `vanilla_1.14`, ... Each layer is a pack; layers apply in version order.
     */
    | {
          kind: 'brarchiveLayers';
          path: string;
          /**
           * Which packs in the folder to compose, by header UUID. Every
           * folder is a layer of some pack, so this selects whole packs
           * rather than individual layers.
           *
           * Every pack in the folder by default, which is what a caller
           * pointing at a folder it assembled itself wants. BDS keeps several
           * unrelated packs in one `behavior_packs` folder - chemistry, the
           * editor and the experimental toggles beside vanilla - and a world
           * composes only the ones it turns on, so a caller pointing at that
           * folder says which. {@link VANILLA_BEHAVIOR_PACK_UUID} is the
           * vanilla one.
           */
          uuids?: readonly string[];
      };

/**
 * A Java datapack: a folder or zip with `pack.mcmeta` and `data/` at its root.
 * It fills the Java registries, where a later pack wins per file except tags,
 * which merge.
 */
export interface DatapackSource {
    kind: 'datapack';
    path: string;
}

/**
 * One member of a {@link PackStack}. Later members win over earlier ones when
 * both define the same identifier.
 */
export type PackSource = BedrockPackSource | DatapackSource;

/** The ordered list of pack sources a world runs. */
export type PackStack = readonly PackSource[];

/** One pack's files, flattened: brarchive containers are already expanded. */
export interface PackFiles {
    /** Where the pack came from, used in diagnostics until the manifest names it. */
    origin: string;
    /** File bytes by pack-relative path with `/` separators. */
    files: Map<string, Uint8Array>;
}

const BRARCHIVE_FOLDER = '__brarchive/';
const BRARCHIVE_EXTENSION = '.brarchive';

/**
 * Which of a pack's files the caller wants the bytes of, by pack-relative
 * path.
 *
 * A pack folder holds far more than definitions - the composed vanilla
 * Bedrock pack ships 1311 `.nbt` structures and a 3 MB `.dat` beside its 2588
 * readable files - and opening each of those costs a syscall pair and a
 * buffer for content the caller then ignores. A caller that knows which paths
 * it can use says so here and the rest are never opened.
 *
 * `manifest.json` and the `__brarchive/` containers are read whichever way
 * this answers, because a pack cannot be expanded without them. The filter
 * then applies to each container's members, so an archive's unwanted files
 * are dropped too.
 */
export type PackFileFilter = (packPath: string) => boolean;

/** The default: every file in the pack, which is what a caller reading a pack whole wants. */
const EVERY_FILE: PackFileFilter = () => true;

/**
 * Expands one stack member into the packs it holds, in apply order.
 * Unreadable members are reported rather than thrown so one bad pack does not
 * hide the rest of the report.
 *
 * @param wanted - Which files to read; see {@link PackFileFilter}. Every file by default.
 */
export const expandSource = (
    source: BedrockPackSource,
    diagnostics: Diagnostic[],
    wanted: PackFileFilter = EVERY_FILE
): PackFiles[] => {
    try {
        switch (source.kind) {
            case 'directory':
                return [readDirectoryPack(source.path, wanted)];
            case 'archive':
                return expandArchive(source.path, diagnostics, wanted);
            case 'brarchiveLayers':
                return readLayerFolders(source.path, source.uuids, diagnostics).map((layer) =>
                    readDirectoryPack(layer, wanted)
                );
        }
    } catch (error) {
        diagnostics.push({
            severity: 'error',
            code: 'source.unreadable',
            pack: source.path,
            message: error instanceof Error ? error.message : String(error)
        });
        return [];
    }
};

/** Whether a path has to be read however the caller's filter answers. */
const isStructural = (packPath: string): boolean =>
    packPath === 'manifest.json' || (packPath.startsWith(BRARCHIVE_FOLDER) && packPath.endsWith(BRARCHIVE_EXTENSION));

/** Reads a pack folder, expanding `__brarchive/` containers into their folders. */
const readDirectoryPack = (path: string, wanted: PackFileFilter): PackFiles => {
    const files = new Map<string, Uint8Array>();
    for (const entry of readdirSync(path, { recursive: true, withFileTypes: true })) {
        if (!entry.isFile()) continue;
        const absolute = join(entry.parentPath, entry.name);
        const packPath = relative(path, absolute).split(sep).join('/');
        if (!isStructural(packPath) && !wanted(packPath)) continue;

        addPackFile(files, packPath, readFileSync(absolute), wanted);
    }
    return { origin: path, files };
};

/**
 * Adds one file, expanding a brarchive container into its folder's members.
 * An archive stands for its whole path under `__brarchive/` minus the
 * extension, not just its name: the vanilla layers ship
 * `__brarchive/loot_tables/entities.brarchive` beside
 * `__brarchive/entities.brarchive`, so the name alone collides and one
 * archive's members overwrite the other's.
 */
const addPackFile = (
    files: Map<string, Uint8Array>,
    packPath: string,
    bytes: Uint8Array,
    wanted: PackFileFilter
): void => {
    if (!packPath.startsWith(BRARCHIVE_FOLDER) || !packPath.endsWith(BRARCHIVE_EXTENSION)) {
        files.set(packPath, bytes);
        return;
    }

    const folder = packPath.slice(BRARCHIVE_FOLDER.length, -BRARCHIVE_EXTENSION.length);
    for (const [member, memberBytes] of readBrarchive(bytes)) {
        const memberPath = member.startsWith(`${folder}/`) ? member : `${folder}/${member}`;
        if (wanted(memberPath)) files.set(memberPath, memberBytes);
    }
};

/** Expands a `.mcpack` (manifest at the root) or `.mcaddon` (nested `.mcpack`s). */
const expandArchive = (path: string, diagnostics: Diagnostic[], wanted: PackFileFilter): PackFiles[] => {
    const entries = readZip(readFileSync(path));
    if (entries.has('manifest.json')) return [zipPack(path, entries, wanted)];

    const packs: PackFiles[] = [];
    for (const [name, bytes] of entries) {
        if (name.endsWith('.mcpack')) {
            if (!isZip(bytes)) {
                diagnostics.push({
                    severity: 'error',
                    code: 'source.unreadable',
                    pack: `${path}/${name}`,
                    message: `${name} is not a zip archive`
                });
                continue;
            }
            packs.push(zipPack(`${path}/${name}`, readZip(bytes), wanted));
        } else if (name.endsWith('.mcworld') || name.endsWith('.mctemplate')) {
            diagnostics.push({
                severity: 'warning',
                code: 'source.skipped',
                pack: path,
                message: `${name} is a world, not a pack, and was skipped`
            });
        }
    }
    if (packs.length === 0) {
        diagnostics.push({
            severity: 'error',
            code: 'source.unreadable',
            pack: path,
            message: 'the archive has neither a root manifest.json nor .mcpack members'
        });
    }
    return packs;
};

const zipPack = (origin: string, entries: Map<string, Uint8Array>, wanted: PackFileFilter): PackFiles => {
    const files = new Map<string, Uint8Array>();
    for (const [name, bytes] of entries) {
        if (isStructural(name) || wanted(name)) addPackFile(files, name, bytes, wanted);
    }
    return { origin, files };
};

/**
 * The header UUID a layer folder's `manifest.json` declares, or undefined
 * when there is no readable manifest to declare one.
 *
 * Read leniently and without validating the rest of the manifest, because
 * this answers which packs to open rather than whether they load: a layer the
 * caller selects goes through {@link parseManifest} when it loads, and a
 * layer the caller did not select is not this load's problem.
 */
const layerUuid = (path: string): string | undefined => {
    let parsed: unknown;
    try {
        parsed = parseLenientJson(readFileSync(join(path, 'manifest.json'), 'utf8'));
    } catch {
        return undefined;
    }
    if (typeof parsed !== 'object' || parsed === null || !('header' in parsed)) return undefined;

    const { header } = parsed;
    if (typeof header !== 'object' || header === null || !('uuid' in header)) return undefined;
    return typeof header.uuid === 'string' ? header.uuid : undefined;
};

/**
 * Orders layer folders the way the engine composes the vanilla pack: the
 * suffix-free base layer first, then by the version in the folder name.
 *
 * @param uuids - The header UUIDs to keep, or undefined to keep every folder.
 *   A UUID no folder declares is reported, so a folder layout that moved out
 *   from under the caller says so instead of composing nothing.
 */
const readLayerFolders = (path: string, uuids: readonly string[] | undefined, diagnostics: Diagnostic[]): string[] => {
    const found = new Set<string>();
    const selected = (name: string): boolean => {
        if (uuids === undefined) return true;
        const uuid = layerUuid(join(path, name));
        if (uuid === undefined || !uuids.includes(uuid)) return false;
        found.add(uuid);
        return true;
    };

    const layers = readdirSync(path)
        .filter((name) => statSync(join(path, name)).isDirectory() && selected(name))
        .map((name) => {
            const suffix = name.match(/_(\d+(?:\.\d+)*)$/)?.[1];
            return { name, version: suffix ? parseVersion(suffix) : undefined };
        });

    for (const uuid of uuids ?? []) {
        if (found.has(uuid)) continue;
        diagnostics.push({
            severity: 'warning',
            code: 'source.unknown-pack',
            pack: path,
            message: `no pack in the folder declares header UUID ${uuid}`
        });
    }

    layers.sort((a, b) => {
        if (!a.version || !b.version) return a.version ? 1 : b.version ? -1 : a.name.localeCompare(b.name);
        return compareVersions(a.version, b.version) || a.name.localeCompare(b.name);
    });

    return layers.map((layer) => join(path, layer.name));
};
