/**
 * The `minecraft:noise` factory against Mojang's real data.
 *
 * Gated like `DataDrivenGenerator.test.ts`: it reads the Java vanilla datapack and the data
 * generator reports, which `pnpm --filter @jsprismarine/bedrock-data run ensure:worldgen`
 * fetches.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';

import { parseWorldPreset } from '@jsprismarine/worldgen';
import type { LevelStem, WorldPreset } from '@jsprismarine/worldgen';

import { testContent } from '../../../testing/entityServer';
import type Chunk from '../../chunk/Chunk';
import { Dimensions } from '../../Dimension';
import type { DimensionType } from '../../Dimension';
import type { Generator } from '../../Generator';
import { GeneratorFactories } from '../../GeneratorFactories';
import type { GeneratorBuildContext } from '../../GeneratorFactories';
import { DataDrivenGenerator } from '../datadriven/DataDrivenGenerator';
import { findJavaTemplateSource } from '../datadriven/javaStructureTemplates';
import { bedrockBiomeIdOf } from '../datadriven/javaTranslation';
import type { JavaWorldgenRegistries } from '../datadriven/javaWorldgenData';
import { cacheRoot, findJavaWorldgenSources, loadJavaWorldgenRegistries } from '../datadriven/javaWorldgenData';
import { createNoiseGeneratorFactory } from './noise';

const sources = findJavaWorldgenSources();
const enabled = sources !== undefined;

const SEED = 1234n;

/** How long one chunk may take. Terrain alone is about 0.6 seconds, decoration adds to it. */
const CHUNK_TIMEOUT = 180_000;

const quiet = { info: () => {}, warn: () => {} };

describe.skipIf(!enabled)('the minecraft:noise factory', { tags: ['real-data'] }, () => {
    let registries: JavaWorldgenRegistries;
    let normal: WorldPreset;
    const factories = new GeneratorFactories();

    const contextFor = (stem: LevelStem, dimension: DimensionType): GeneratorBuildContext => ({
        stem,
        dimension,
        seed: SEED,
        content: testContent,
        worldgen: () => registries,
        logger: quiet,
        // Workers cannot import a `.ts` pipeline under vitest's loader.
        workers: 0
    });

    const stemOf = (dimension: DimensionType): LevelStem => {
        const stem = normal.dimensions.get(dimension.id);
        if (stem === undefined) throw new Error(`normal.json has no ${dimension.id} stem`);
        return stem;
    };

    const census = (chunk: Chunk, name: string): number => {
        let count = 0;
        for (let x = 0; x < 16; x++) {
            for (let z = 0; z < 16; z++) {
                for (let y = chunk.getMinY(); y <= chunk.getMaxY(); y++) {
                    if (chunk.getBlock(x, y, z).name === name) count++;
                }
            }
        }
        return count;
    };

    beforeAll(() => {
        registries = loadJavaWorldgenRegistries(sources!);
        const presetPath = join(sources!.datapack, 'data', 'minecraft', 'worldgen', 'world_preset', 'normal.json');
        // Extracted game data: parsed, never executed.
        normal = parseWorldPreset(JSON.parse(readFileSync(presetPath, 'utf8')), presetPath);
    }, CHUNK_TIMEOUT);

    afterAll(() => factories.stopGenerating());
    afterEach(() => vi.restoreAllMocks());

    it(
        'builds the End from its stem and puts the main island at the origin',
        async () => {
            const generator = factories.build(contextFor(stemOf(Dimensions.TheEnd), Dimensions.TheEnd));
            const chunk = await generator.generateChunk(0, 0, SEED);

            expect(chunk.getDimension()).toBe(Dimensions.TheEnd);
            expect(chunk.getMinY()).toBe(0);
            expect(chunk.getBiome(8, 64, 8)).toBe(bedrockBiomeIdOf('minecraft:the_end'));
            expect(census(chunk, 'minecraft:end_stone')).toBeGreaterThan(0);
            expect(chunk.getBlock(8, 0, 8).name).toBe('minecraft:air');
        },
        CHUNK_TIMEOUT
    );

    it(
        'serves the End and the Overworld from one generator',
        async () => {
            const forStem = vi.spyOn(DataDrivenGenerator.prototype, 'forStem');
            const own = new GeneratorFactories();
            const end = own.build(contextFor(stemOf(Dimensions.TheEnd), Dimensions.TheEnd));
            const overworld = own.build(contextFor(stemOf(Dimensions.Overworld), Dimensions.Overworld));

            // One instance behind both views, which is the one pool the server runs.
            expect(forStem).toHaveBeenCalledTimes(2);
            expect(forStem.mock.instances[0]).toBe(forStem.mock.instances[1]);
            expect(end).not.toBe(overworld);

            const [endChunk, overworldChunk] = await Promise.all([
                end.generateChunk(0, 0, SEED),
                overworld.generateChunk(0, 0, SEED)
            ]);

            expect(endChunk.getDimension()).toBe(Dimensions.TheEnd);
            expect(endChunk.getMinY()).toBe(0);
            expect(census(endChunk, 'minecraft:end_stone')).toBeGreaterThan(0);
            expect(overworldChunk.getDimension()).toBe(Dimensions.Overworld);
            expect(overworldChunk.getMinY()).toBe(-64);
            expect(overworldChunk.getBlock(0, -64, 0).name).toBe('minecraft:bedrock');
            expect(census(overworldChunk, 'minecraft:end_stone')).toBe(0);
            own.stopGenerating();
        },
        CHUNK_TIMEOUT
    );

    it(
        'builds the Overworld stem to the same chunk the generator builds on its own',
        async () => {
            const viaFactory = factories.build(contextFor(stemOf(Dimensions.Overworld), Dimensions.Overworld));
            const direct: Generator = new DataDrivenGenerator({
                registries,
                templates: findJavaTemplateSource(cacheRoot(), registries.processorLists)
            });

            const mine = await viaFactory.generateChunk(3, -5, SEED);
            const theirs = await direct.generateChunk(3, -5, SEED);

            expect(mine.networkSerialize().equals(theirs.networkSerialize())).toBe(true);
            direct.stopGenerating?.();
        },
        CHUNK_TIMEOUT
    );

    it('reports the sea level of each stem from its noise_settings', () => {
        const own = new GeneratorFactories();

        expect(own.build(contextFor(stemOf(Dimensions.Overworld), Dimensions.Overworld)).seaLevel).toBe(63);
        expect(own.build(contextFor(stemOf(Dimensions.Nether), Dimensions.Nether)).seaLevel).toBe(32);
        expect(own.build(contextFor(stemOf(Dimensions.TheEnd), Dimensions.TheEnd)).seaLevel).toBe(0);
        own.stopGenerating();
    });

    it('refuses a settings id no noise_settings document defines', () => {
        const stem: LevelStem = {
            type: Dimensions.Overworld.id,
            generator: {
                type: 'minecraft:noise',
                settings: 'minecraft:no_such_settings',
                biomeSource: { type: 'minecraft:fixed', biome: 'minecraft:plains' }
            }
        };

        expect(() => createNoiseGeneratorFactory().build(contextFor(stem, Dimensions.Overworld))).toThrowError(
            'minecraft:no_such_settings, which no worldgen/noise_settings document defines'
        );
    });

    it('refuses a multi_noise preset the reports do not list', () => {
        const stem: LevelStem = {
            type: Dimensions.Overworld.id,
            generator: {
                type: 'minecraft:noise',
                settings: 'minecraft:overworld',
                biomeSource: { type: 'minecraft:multi_noise', preset: 'minecraft:no_such_preset' }
            }
        };

        expect(() => createNoiseGeneratorFactory().build(contextFor(stem, Dimensions.Overworld))).toThrowError(
            'no multi_noise_biome_source_parameter_list named "minecraft:no_such_preset"'
        );
    });

    it(
        'registers an inline settings document under its own id',
        async () => {
            const overworld = registries.noiseSettings.get('minecraft:overworld');
            if (typeof overworld !== 'object' || overworld === null) throw new Error('no overworld settings');
            const stem: LevelStem = {
                type: Dimensions.Overworld.id,
                generator: {
                    type: 'minecraft:noise',
                    settings: { ...overworld },
                    biomeSource: { type: 'minecraft:fixed', biome: 'minecraft:desert' }
                }
            };

            const generator = factories.build(contextFor(stem, Dimensions.Overworld));
            const chunk = await generator.generateChunk(0, 0, SEED);

            expect(chunk.getBiome(0, 64, 0)).toBe(bedrockBiomeIdOf('minecraft:desert'));
            expect(chunk.getHighestBlockAt(0, 0)).not.toBeNull();
        },
        CHUNK_TIMEOUT
    );
});
