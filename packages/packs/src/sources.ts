import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative, sep } from 'node:path';

import { readBrarchive } from './brarchive';
import type { Diagnostic } from './diagnostics';
import { compareVersions, parseVersion } from './formatVersion';
import { isZip, readZip } from './zip';

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
    | { kind: 'brarchiveLayers'; path: string };

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
                return readLayerFolders(source.path).map((layer) => readDirectoryPack(layer, wanted));
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
 * Orders layer folders the way the engine composes the vanilla pack: the
 * suffix-free base layer first, then by the version in the folder name.
 */
const readLayerFolders = (path: string): string[] => {
    const layers = readdirSync(path)
        .filter((name) => statSync(join(path, name)).isDirectory())
        .map((name) => {
            const suffix = name.match(/_(\d+(?:\.\d+)*)$/)?.[1];
            return { name, version: suffix ? parseVersion(suffix) : undefined };
        });

    layers.sort((a, b) => {
        if (!a.version || !b.version) return a.version ? 1 : b.version ? -1 : a.name.localeCompare(b.name);
        return compareVersions(a.version, b.version) || a.name.localeCompare(b.name);
    });

    return layers.map((layer) => join(path, layer.name));
};
