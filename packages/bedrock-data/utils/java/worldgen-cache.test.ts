import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import {
    javaServerJarPath,
    worldgenCacheComplete,
    worldgenCachePaths,
    type WorldgenCachePaths
} from './worldgen-cache.ts';

let root: string;

beforeEach(async () => {
    root = await mkdtemp(join(tmpdir(), 'jsp-worldgen-cache-'));
});

afterEach(async () => {
    await rm(root, { recursive: true, force: true });
});

const touch = async (path: string): Promise<void> => {
    await mkdir(dirname(path), { recursive: true });
    await writeFile(path, '');
};

/** Every witness a finished data generator run leaves behind, under a scratch root. */
const completeCache = async (paths: WorldgenCachePaths): Promise<void> => {
    for (const witness of [
        'pack.mcmeta',
        'data/minecraft/worldgen/noise_settings/overworld.json',
        'data/minecraft/worldgen/biome/plains.json',
        'data/minecraft/tags/block/logs.json',
        'data/minecraft/loot_table/blocks/stone.json'
    ]) {
        await touch(join(paths.datapack, ...witness.split('/')));
    }
    for (const witness of [
        'reports/blocks.json',
        'reports/registries.json',
        'reports/biome_parameters/minecraft/overworld.json'
    ]) {
        await touch(join(paths.reports, ...witness.split('/')));
    }
    await touch(join(paths.structures, 'village', 'plains', 'houses', 'plains_small_house_1.nbt'));
};

/** The same shape as the real cache, rooted somewhere a test may delete from. */
const scratchPaths = (base: string): WorldgenCachePaths => ({
    datapack: join(base, 'vanilla-datapack', '26.3'),
    reports: join(base, 'java-reports', '26.3', 'generated'),
    structures: join(base, 'java-structures', '26.3'),
    work: join(base, 'java-datagen', '26.3')
});

describe('worldgenCacheComplete', () => {
    it('reports a finished data generator run as complete', async () => {
        const paths = scratchPaths(root);
        await completeCache(paths);

        expect(worldgenCacheComplete(paths)).toBe(true);
    });

    it('reports an empty cache as incomplete', () => {
        expect(worldgenCacheComplete(scratchPaths(root))).toBe(false);
    });

    it.each([
        ['the datapack', 'vanilla-datapack/26.3/data/minecraft/worldgen/biome/plains.json'],
        ['the reports', 'java-reports/26.3/generated/reports/biome_parameters/minecraft/overworld.json'],
        ['the structure templates', 'java-structures/26.3/village/plains/houses/plains_small_house_1.nbt']
    ])('reports a run that left %s half-written as incomplete', async (_registry, missing) => {
        const paths = scratchPaths(root);
        await completeCache(paths);
        await rm(join(root, ...missing.split('/')));

        expect(worldgenCacheComplete(paths)).toBe(false);
    });
});

describe('worldgenCachePaths', () => {
    it('keeps each version of the output apart', () => {
        expect(worldgenCachePaths('26.3').datapack).not.toBe(worldgenCachePaths('26.4').datapack);
    });
});

describe('javaServerJarPath', () => {
    const source = {
        name: 'java-server',
        version: '26.3',
        url: 'https://example.invalid/server.jar',
        hash: { algorithm: 'sha256' as const, value: 'f'.repeat(64) },
        unpack: false,
        fileName: 'server.jar',
        envOverride: 'JSP_WORLDGEN_CACHE_TEST_JAR'
    };

    afterEach(() => {
        delete process.env[source.envOverride];
    });

    it('falls back to the fetch cache when nothing overrides it', () => {
        expect(javaServerJarPath(source)).toMatch(/java-server[/\\]26\.3[/\\]server\.jar$/);
    });

    it('uses a local copy the environment points at', () => {
        process.env[source.envOverride] = '/somewhere/else/server.jar';

        expect(javaServerJarPath(source)).toBe('/somewhere/else/server.jar');
    });

    it('ignores an override set to the empty string', () => {
        process.env[source.envOverride] = '';

        expect(javaServerJarPath(source)).toMatch(/java-server[/\\]26\.3[/\\]server\.jar$/);
    });
});
