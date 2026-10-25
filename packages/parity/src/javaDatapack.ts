import { load, readZip } from '@jsprismarine/packs';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';

import { FETCH_CACHE, REFERENCES } from './references.ts';

/**
 * Loads Java Edition's vanilla datapack out of the pinned server jar, which is where the 1447
 * loot tables and 2042 recipe files the loot and recipe rows compare against live.
 *
 * Mojang ships the datapack inside the jar rather than as a download, so the first call
 * unpacks the JSON into the fetch cache beside the jar and later calls read the unpacked copy.
 * The jar is a downloaded archive, so nothing here resolves an entry name against the file
 * system and nothing executes what it finds; entry names are checked before they become paths.
 */

/** The directories of `data/minecraft/` the parity rows read. */
const WANTED = ['loot_table/', 'recipe/', 'tags/', 'predicate/', 'item_modifier/'];

/** Rejects an archive entry name that would escape the directory it unpacks into. */
const isSafePath = (path: string): boolean =>
    !path.startsWith('/') && !path.includes('\\') && path.split('/').every((segment) => segment !== '..');

/**
 * Unpacks the vanilla datapack JSON out of the pinned server jar, once per version.
 *
 * Mojang's published jar is a bundler holding the real server jar under `META-INF/versions/`,
 * and the datapack is inside that one.
 * @returns The directory holding `pack.mcmeta` and `data/`.
 * @throws {Error} When the jar is not in the fetch cache, or holds no inner server jar.
 */
export const unpackVanillaDatapack = (): string => {
    const jarPath = REFERENCES.javaServerJar.locate();
    if (jarPath === undefined) throw new Error('the pinned Java server jar is not in the fetch cache');

    const version = dirname(jarPath).split('/').pop() ?? 'unknown';
    const target = join(FETCH_CACHE, 'vanilla-datapack', version);
    const mcmeta = join(target, 'pack.mcmeta');
    if (existsSync(mcmeta)) return target;

    const bundler = readZip(readFileSync(jarPath));
    const innerName = [...bundler.keys()].find((name) => /^META-INF\/versions\/[^/]+\/server-.+\.jar$/.test(name));
    if (innerName === undefined) throw new Error('the server jar holds no META-INF/versions inner jar');

    for (const [name, bytes] of readZip(bundler.get(innerName)!)) {
        if (!name.endsWith('.json') || !isSafePath(name)) continue;
        if (!WANTED.some((wanted) => name.startsWith(`data/minecraft/${wanted}`))) continue;
        const absolute = join(target, ...name.split('/'));
        mkdirSync(dirname(absolute), { recursive: true });
        writeFileSync(absolute, bytes);
    }

    writeFileSync(
        mcmeta,
        JSON.stringify({ pack: { description: `vanilla ${version}`, min_format: [121, 0], max_format: [121, 0] } })
    );
    return target;
};

/** The loaded vanilla datapack: the registries `@jsprismarine/packs` reads out of it. */
export type VanillaDatapack = ReturnType<typeof load>;

/** Loads the vanilla datapack through the pack loader, the way a server loads one. */
export const loadVanillaDatapack = (): VanillaDatapack => load([{ kind: 'datapack', path: unpackVanillaDatapack() }]);
