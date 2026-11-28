/**
 * A world's `world_resource_packs.json`: the resource packs a Bedrock world turns on, each by its
 * header UUID and version, with the subpack it is applied with.
 *
 * Protocol 2225's pinned Bedrock Dedicated Server sends the `subpack` an entry names as the pack's
 * `Subpack Name` in both `ResourcePacksInfo` and `ResourcePackStack`, and an empty name for a
 * pack no entry picks a subpack for. An entry whose version is not the pack's names a pack the
 * server does not have, which it ignores.
 */
import path from 'node:path';

import { parseLenientJson } from '@jsprismarine/packs/lenientJson';

import { readFileIfPresent } from '../utils/readFileIfPresent';
import { isRecord } from '../utils/isRecord';

/** The file a world folder lists its resource packs in. */
export const WORLD_RESOURCE_PACKS_FILE = 'world_resource_packs.json';

/** One entry of `world_resource_packs.json`. */
export interface WorldResourcePack {
    /** `version`, `major.minor.patch`. */
    readonly version: string;
    /** `subpack`, the `folder_name` of the subpack to apply, when the entry names one. */
    readonly subpack?: string;
}

/**
 * Reads a world's resource pack entries, by header UUID in lowercase. A world without the file,
 * or with one that does not read, picks nothing.
 * @param worldFolder - The world's folder, such as `worlds/world`.
 * @returns The entries, and why the file could not be read when it could not.
 */
export const readWorldResourcePacks = async (
    worldFolder: string
): Promise<{ readonly packs: ReadonlyMap<string, WorldResourcePack>; readonly problem?: string }> => {
    const file = path.join(worldFolder, WORLD_RESOURCE_PACKS_FILE);
    const bytes = await readFileIfPresent(file);
    if (bytes === undefined) return { packs: new Map() };
    const text = new TextDecoder().decode(bytes);
    let value: unknown;
    try {
        value = parseLenientJson(text);
    } catch (error: unknown) {
        return { packs: new Map(), problem: `${file} does not read: ${String(error)}` };
    }
    if (!Array.isArray(value)) return { packs: new Map(), problem: `${file} is not a list` };
    const packs = new Map<string, WorldResourcePack>();
    for (const entry of value) {
        if (!isRecord(entry) || typeof entry.pack_id !== 'string') continue;
        const version = Array.isArray(entry.version) ? entry.version.join('.') : String(entry.version ?? '');
        packs.set(entry.pack_id.toLowerCase(), {
            version,
            ...(typeof entry.subpack === 'string' && entry.subpack.length > 0 ? { subpack: entry.subpack } : {})
        });
    }
    return { packs };
};

/**
 * The subpack a world picks for a pack, as BDS sends it: the entry's `subpack` when the entry is
 * for this version of the pack and the pack has a subpack by that folder name, otherwise none.
 * @param world - The world's entries.
 * @param pack - The pack's UUID, version and subpack folder names.
 */
export const subpackOf = (
    world: ReadonlyMap<string, WorldResourcePack>,
    pack: { readonly uuid: string; readonly version: string; readonly subpacks: readonly string[] }
): string => {
    const entry = world.get(pack.uuid);
    if (entry?.subpack === undefined || entry.version !== pack.version) return '';
    return pack.subpacks.includes(entry.subpack) ? entry.subpack : '';
};
