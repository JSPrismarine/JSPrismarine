import { readFileSync, readdirSync, statSync } from 'node:fs';
import { basename, join, relative, sep } from 'node:path';

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

/**
 * Expands one stack member into the packs it holds, in apply order.
 * Unreadable members are reported rather than thrown so one bad pack does not
 * hide the rest of the report.
 */
export const expandSource = (source: BedrockPackSource, diagnostics: Diagnostic[]): PackFiles[] => {
    try {
        switch (source.kind) {
            case 'directory':
                return [readDirectoryPack(source.path)];
            case 'archive':
                return expandArchive(source.path, diagnostics);
            case 'brarchiveLayers':
                return readLayerFolders(source.path).map(readDirectoryPack);
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

/** Reads a pack folder, expanding `__brarchive/` containers into their folders. */
const readDirectoryPack = (path: string): PackFiles => {
    const files = new Map<string, Uint8Array>();
    for (const entry of readdirSync(path, { recursive: true, withFileTypes: true })) {
        if (!entry.isFile()) continue;
        const absolute = join(entry.parentPath, entry.name);
        const packPath = relative(path, absolute).split(sep).join('/');
        addPackFile(files, packPath, readFileSync(absolute));
    }
    return { origin: path, files };
};

/** Adds one file, expanding a brarchive container into its folder's members. */
const addPackFile = (files: Map<string, Uint8Array>, packPath: string, bytes: Uint8Array): void => {
    if (!packPath.startsWith(BRARCHIVE_FOLDER) || !packPath.endsWith('.brarchive')) {
        files.set(packPath, bytes);
        return;
    }

    const folder = basename(packPath, '.brarchive');
    for (const [member, memberBytes] of readBrarchive(bytes)) {
        const memberPath = member.startsWith(`${folder}/`) ? member : `${folder}/${member}`;
        files.set(memberPath, memberBytes);
    }
};

/** Expands a `.mcpack` (manifest at the root) or `.mcaddon` (nested `.mcpack`s). */
const expandArchive = (path: string, diagnostics: Diagnostic[]): PackFiles[] => {
    const entries = readZip(readFileSync(path));
    if (entries.has('manifest.json')) return [zipPack(path, entries)];

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
            packs.push(zipPack(`${path}/${name}`, readZip(bytes)));
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

const zipPack = (origin: string, entries: Map<string, Uint8Array>): PackFiles => {
    const files = new Map<string, Uint8Array>();
    for (const [name, bytes] of entries) addPackFile(files, name, bytes);
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
