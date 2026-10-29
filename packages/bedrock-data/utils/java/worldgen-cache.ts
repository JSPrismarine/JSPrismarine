/**
 * Where the Java Edition world generation cache lives and how to tell a finished one from a
 * half-written one.
 *
 * `datagen.ts` writes the cache and `ensure-worldgen.ts` decides whether it has to. Both read
 * the layout from here so there is one description of what a complete cache looks like.
 */
import { existsSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { loadSourceDescriptors, type SourceDescriptor } from '../fetch/manifest.ts';

/** This package's root, the directory holding `sources.json`. */
export const packageDir = resolve(dirname(fileURLToPath(import.meta.url)), '../..');

/** The repository-wide fetch cache the Java steps read and write. */
export const cacheRoot = resolve(packageDir, '../../node_modules/.cache/jsprismarine');

/** The `sources.json` entry for the pinned Java Edition server jar. */
export const loadJavaServerSource = async (): Promise<SourceDescriptor> => {
    const descriptors = await loadSourceDescriptors(join(packageDir, 'sources.json'));
    const javaServer = descriptors.find((descriptor) => descriptor.name === 'java-server');
    if (javaServer === undefined) throw new Error('sources.json no longer pins a java-server source');

    return javaServer;
};

/** The jar the data generator runs, either the fetched one or the caller's own copy. */
export const javaServerJarPath = (source: SourceDescriptor): string => {
    const override = process.env[source.envOverride];
    if (override !== undefined && override !== '') return override;

    return join(cacheRoot, source.name, source.version, source.fileName);
};

/** The four directories one data generator run reads and writes. */
export interface WorldgenCachePaths {
    /** The vanilla datapack root, the directory holding `data/` and `pack.mcmeta`. */
    readonly datapack: string;
    /** The data generator output root, the directory holding `reports/`. */
    readonly reports: string;
    /** The structure templates extracted straight out of the jar. */
    readonly structures: string;
    /** Scratch space the bundler unpacks into, deleted once the run finishes. */
    readonly work: string;
}

/** Where a given Java Edition version's generated data belongs. */
export const worldgenCachePaths = (version: string): WorldgenCachePaths => ({
    datapack: join(cacheRoot, 'vanilla-datapack', version),
    reports: join(cacheRoot, 'java-reports', version, 'generated'),
    structures: join(cacheRoot, 'java-structures', version),
    work: join(cacheRoot, 'java-datagen', version)
});

/**
 * Files that prove a previous run finished. Each names a registry a different reader depends on,
 * so a half-written cache fails the check instead of being skipped over.
 */
const WITNESSES = {
    datapack: [
        'pack.mcmeta',
        'data/minecraft/worldgen/noise_settings/overworld.json',
        'data/minecraft/worldgen/biome/plains.json',
        'data/minecraft/tags/block/logs.json',
        'data/minecraft/loot_table/blocks/stone.json'
    ],
    reports: ['reports/blocks.json', 'reports/registries.json', 'reports/biome_parameters/minecraft/overworld.json'],
    /** One template every overworld needs, which proves the extraction finished. */
    structures: ['village/plains/houses/plains_small_house_1.nbt']
} as const satisfies Record<keyof Omit<WorldgenCachePaths, 'work'>, readonly string[]>;

/**
 * Whether every witness is on disk, so the data generator has nothing left to do.
 *
 * This is the only question `ensure:worldgen` asks on a warm cache, so it stays to file
 * existence checks and never reaches the network.
 */
export const worldgenCacheComplete = (paths: WorldgenCachePaths): boolean =>
    (Object.keys(WITNESSES) as (keyof typeof WITNESSES)[]).every((registry) =>
        WITNESSES[registry].every((witness) => existsSync(join(paths[registry], ...witness.split('/'))))
    );
