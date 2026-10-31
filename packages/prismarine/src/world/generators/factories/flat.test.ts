import { describe, expect, it } from 'vitest';

import type { FlatGeneratorSettings } from '@jsprismarine/worldgen';

import { testContent } from '../../../testing/entityServer';
import { stub } from '../../../testing/stub.test.helper';
import { Dimensions } from '../../Dimension';
import type { DimensionType } from '../../Dimension';
import type { GeneratorBuildContext } from '../../GeneratorFactories';
import { GeneratorFactories } from '../../GeneratorFactories';
import type { JavaWorldgenRegistries } from '../datadriven/javaWorldgenData';
import { bedrockBiomeIdOf } from '../datadriven/javaTranslation';
import { FLAT_SEA_LEVEL, FlatGenerator } from '../Flat';
import { DEFAULT_FLAT_SETTINGS, flatGeneratorFactory, flatStem } from './flat';

const contextFor = (
    dimension: DimensionType,
    settings: FlatGeneratorSettings | string,
    worldgen: () => JavaWorldgenRegistries = () => {
        throw new Error('A flat world with its own layers never reads the Java registries');
    }
): GeneratorBuildContext => ({
    stem: flatStem(dimension.id, settings),
    dimension,
    seed: 1n,
    content: testContent,
    worldgen,
    logger: { info: () => {}, warn: () => {} }
});

/**
 * Registries carrying one `worldgen/flat_level_generator_preset`, in the datapack's shape: the
 * settings object under `settings`, beside the `display` item the preset picker shows.
 */
const registriesWithPreset = (id: string, settings: Record<string, unknown>): (() => JavaWorldgenRegistries) => {
    const registries = stub<JavaWorldgenRegistries>({
        flatLevelGeneratorPresets: new Map([[id, { display: 'minecraft:stone', settings }]])
    });
    return () => registries;
};

/**
 * Layers out of the two blocks the fixture content knows. A real Nether preset would say
 * bedrock and netherrack; the shape of the column is what is under test.
 */
const netherFlat: FlatGeneratorSettings = {
    layers: [
        { block: 'minecraft:redstone_lamp', height: 1 },
        { block: 'minecraft:stone', height: 3 }
    ],
    biome: 'minecraft:crimson_forest',
    lakes: false,
    features: false
};

describe('the minecraft:flat factory', () => {
    it('is the kind the registry starts with', () => {
        expect(new GeneratorFactories().kinds()).toContain(flatGeneratorFactory.kind);
    });

    it('stacks the layers from the floor of a Nether-typed dimension', async () => {
        const generator = flatGeneratorFactory.build(contextFor(Dimensions.Nether, netherFlat));
        const chunk = await generator.generateChunk(3, -2, 1n);

        expect(chunk.getDimension()).toBe(Dimensions.Nether);
        expect(chunk.getMinY()).toBe(0);
        expect(chunk.getBlock(0, 0, 0).name).toBe('minecraft:redstone_lamp');
        expect(chunk.getBlock(15, 1, 15).name).toBe('minecraft:stone');
        expect(chunk.getBlock(7, 3, 7).name).toBe('minecraft:stone');
        expect(chunk.getBlock(7, 4, 7).name).toBe('minecraft:air');
        expect(generator.surfaceAt?.(0, 0)).toEqual({ y: 3, name: 'minecraft:stone' });
    });

    it('puts the settings biome through the whole column', async () => {
        const generator = flatGeneratorFactory.build(contextFor(Dimensions.Nether, netherFlat));
        const chunk = await generator.generateChunk(0, 0, 1n);

        const expected = bedrockBiomeIdOf('minecraft:crimson_forest');
        expect(chunk.getBiome(0, 0, 0)).toBe(expected);
        expect(chunk.getBiome(15, 127, 15)).toBe(expected);
    });

    it('drops the layers above the ceiling', async () => {
        const generator = flatGeneratorFactory.build(
            contextFor(Dimensions.Nether, {
                ...netherFlat,
                layers: [
                    { block: 'minecraft:redstone_lamp', height: 1 },
                    { block: 'minecraft:stone', height: 4000 }
                ]
            })
        );
        const chunk = await generator.generateChunk(0, 0, 1n);

        expect(chunk.getBlock(0, 127, 0).name).toBe('minecraft:stone');
        expect(generator.surfaceAt?.(0, 0)).toEqual({ y: 127, name: 'minecraft:stone' });
    });

    it('leaves an unknown layer block as a gap and says so once', async () => {
        const warnings: string[] = [];
        const generator = new FlatGenerator({
            settings: {
                ...netherFlat,
                layers: [
                    { block: 'minecraft:not_a_block', height: 1 },
                    { block: 'minecraft:stone', height: 1 }
                ]
            },
            dimension: Dimensions.Overworld,
            content: testContent,
            logger: { info: () => {}, warn: (...message) => warnings.push(message.join(' ')) }
        });
        const chunk = await generator.generateChunk(0, 0);
        await generator.generateChunk(1, 0);

        expect(chunk.getBlock(0, -64, 0).name).toBe('minecraft:air');
        expect(chunk.getBlock(0, -63, 0).name).toBe('minecraft:stone');
        expect(warnings).toEqual(['Flat layer block minecraft:not_a_block is unknown and generates as air']);
        expect(generator.surfaceAt()).toEqual({ y: -63, name: 'minecraft:stone' });
    });

    it('resolves a flat_level_generator_preset id through the pack stack', async () => {
        const generator = flatGeneratorFactory.build(
            contextFor(
                Dimensions.Nether,
                'test:nether_flat',
                registriesWithPreset('test:nether_flat', {
                    biome: 'minecraft:crimson_forest',
                    layers: [
                        { block: 'minecraft:redstone_lamp', height: 1 },
                        { block: 'minecraft:stone', height: 3 }
                    ]
                })
            )
        );
        const chunk = await generator.generateChunk(0, 0, 1n);

        expect(chunk.getBlock(0, 0, 0).name).toBe('minecraft:redstone_lamp');
        expect(chunk.getBlock(7, 3, 7).name).toBe('minecraft:stone');
        expect(chunk.getBlock(7, 4, 7).name).toBe('minecraft:air');
        expect(chunk.getBiome(0, 0, 0)).toBe(bedrockBiomeIdOf('minecraft:crimson_forest'));
    });

    it('refuses a preset id no pack defines, naming the registry', () => {
        expect(() =>
            flatGeneratorFactory.build(
                contextFor(Dimensions.Nether, 'test:missing', registriesWithPreset('test:other', { layers: [] }))
            )
        ).toThrowError(
            'The minecraft:the_nether stem names the flat preset test:missing, which no worldgen/flat_level_generator_preset document defines'
        );
    });

    it('refuses a preset whose settings do not parse, naming the document', () => {
        expect(() =>
            flatGeneratorFactory.build(
                contextFor(Dimensions.Nether, 'test:broken', registriesWithPreset('test:broken', { layers: 'none' }))
            )
        ).toThrowError('worldgen/flat_level_generator_preset/test:broken.settings.layers');
    });

    it('floods to nothing: its sea level is one above the Overworld floor, as in Java', () => {
        const generator = flatGeneratorFactory.build(contextFor(Dimensions.Overworld, DEFAULT_FLAT_SETTINGS));

        expect(generator.seaLevel).toBe(FLAT_SEA_LEVEL);
        expect(generator.seaLevel).toBe(-63);
    });

    it('defaults to the layers the old Flat generator stacked, in plains', () => {
        expect(DEFAULT_FLAT_SETTINGS).toEqual({
            layers: [
                { block: 'minecraft:bedrock', height: 1 },
                { block: 'minecraft:dirt', height: 2 },
                { block: 'minecraft:grass_block', height: 1 }
            ],
            biome: 'minecraft:plains',
            lakes: false,
            features: false
        });
        expect(flatStem('minecraft:overworld').generator).toEqual({
            type: 'minecraft:flat',
            settings: DEFAULT_FLAT_SETTINGS
        });
    });
});
