import { describe, expect, it } from 'vitest';

import {
    CheckerboardBiomeSource,
    FixedBiomeSource,
    MultiNoiseBiomeSource,
    TheEndBiomeSource
} from '../biome/BiomeSource';
import { findVanillaDatapack } from '../../vectors/javaDatapack';
import type { BiomeSourceDefinition } from './parseBiomeSource';
import { parseBiomeSource, parseBiomeSourceDefinition } from './parseBiomeSource';

const ZERO = { min: 0, max: 0 };
const POINT = {
    temperature: ZERO,
    humidity: ZERO,
    continentalness: ZERO,
    erosion: ZERO,
    depth: ZERO,
    weirdness: ZERO,
    offset: 0
};

/** A two-entry parameter list in the shape of `reports/biome_parameters`. */
const PARAMETERS = {
    biomes: [
        {
            biome: 'minecraft:nether_wastes',
            parameters: {
                ...POINT,
                temperature: 0,
                humidity: 0,
                continentalness: 0,
                erosion: 0,
                depth: 0,
                weirdness: 0
            }
        },
        {
            biome: 'minecraft:soul_sand_valley',
            parameters: {
                ...POINT,
                temperature: 0,
                humidity: -0.5,
                continentalness: 0,
                erosion: 0,
                depth: 0,
                weirdness: 0
            }
        }
    ]
};

const noLists = new Map<string, unknown>();

describe('parseBiomeSourceDefinition', () => {
    it('reads each of the four kinds', () => {
        expect(parseBiomeSourceDefinition({ type: 'minecraft:multi_noise', preset: 'minecraft:overworld' })).toEqual({
            type: 'minecraft:multi_noise',
            preset: 'minecraft:overworld'
        });
        expect(parseBiomeSourceDefinition({ type: 'minecraft:fixed', biome: 'plains' })).toEqual({
            type: 'minecraft:fixed',
            biome: 'minecraft:plains'
        });
        expect(
            parseBiomeSourceDefinition({ type: 'minecraft:checkerboard', biomes: ['minecraft:plains', 'desert'] })
        ).toEqual({ type: 'minecraft:checkerboard', biomes: ['minecraft:plains', 'minecraft:desert'], scale: 2 });
        expect(parseBiomeSourceDefinition({ type: 'the_end' })).toEqual({ type: 'minecraft:the_end' });
    });

    it('reads an inline multi_noise biome list into climate boxes', () => {
        const definition = parseBiomeSourceDefinition({ type: 'minecraft:multi_noise', ...PARAMETERS });
        if (definition.type !== 'minecraft:multi_noise' || !('biomes' in definition)) throw new Error('wrong variant');
        expect(definition.biomes.map((entry) => entry.biome)).toEqual([
            'minecraft:nether_wastes',
            'minecraft:soul_sand_valley'
        ]);
        expect(definition.biomes[1]?.parameters.humidity).toEqual({ min: -5000, max: -5000 });
    });

    it('names the type and the path of an unknown kind', () => {
        expect(() =>
            parseBiomeSourceDefinition({ type: 'minecraft:vanilla_layered' }, 'stem.generator.biome_source')
        ).toThrow('stem.generator.biome_source: unknown biome source type "minecraft:vanilla_layered"');
    });

    it('rejects a checkerboard scale outside 0 to 62 and a biome tag', () => {
        expect(() =>
            parseBiomeSourceDefinition({ type: 'minecraft:checkerboard', biomes: ['plains'], scale: 63 }, 'p')
        ).toThrow('p.scale has to be between 0 and 62');
        expect(() =>
            parseBiomeSourceDefinition({ type: 'minecraft:checkerboard', biomes: '#minecraft:is_overworld' }, 'p')
        ).toThrow('p.biomes: biome tags are not resolved here');
    });
});

describe('parseBiomeSource', () => {
    it('builds a fixed source', () => {
        const source = parseBiomeSource({ type: 'minecraft:fixed', biome: 'minecraft:plains' }, noLists);
        expect(source).toBeInstanceOf(FixedBiomeSource);
        expect(source.possibleBiomes()).toEqual(['minecraft:plains']);
    });

    it('builds a checkerboard source with its scale', () => {
        const source = parseBiomeSource(
            { type: 'minecraft:checkerboard', biomes: ['minecraft:plains', 'minecraft:desert'], scale: 3 },
            noLists
        );
        expect(source).toBeInstanceOf(CheckerboardBiomeSource);
        expect(source).toMatchObject({ scale: 3 });
        expect(source.possibleBiomes()).toEqual(['minecraft:plains', 'minecraft:desert']);
    });

    it('builds the end source', () => {
        expect(parseBiomeSource({ type: 'minecraft:the_end' }, noLists)).toBeInstanceOf(TheEndBiomeSource);
    });

    it('resolves a multi_noise preset through the parameter lists', () => {
        const lists = new Map<string, unknown>([['minecraft:nether', PARAMETERS]]);
        const source = parseBiomeSource({ type: 'minecraft:multi_noise', preset: 'minecraft:nether' }, lists);
        expect(source).toBeInstanceOf(MultiNoiseBiomeSource);
        expect(source.possibleBiomes()).toEqual(['minecraft:nether_wastes', 'minecraft:soul_sand_valley']);
    });

    it('builds a multi_noise source from inline biomes', () => {
        const definition = parseBiomeSourceDefinition({ type: 'minecraft:multi_noise', ...PARAMETERS });
        const source = parseBiomeSource(definition, noLists);
        expect(source).toBeInstanceOf(MultiNoiseBiomeSource);
        expect(source.possibleBiomes()).toEqual(['minecraft:nether_wastes', 'minecraft:soul_sand_valley']);
    });

    it('names a preset that no parameter list defines', () => {
        expect(() =>
            parseBiomeSource({ type: 'minecraft:multi_noise', preset: 'minecraft:moon' }, noLists, 'stem.biome_source')
        ).toThrow('stem.biome_source.preset: no multi_noise_biome_source_parameter_list named "minecraft:moon"');
    });

    it('names the type and the path of a kind the union does not list', () => {
        // A definition read from untyped JSON can carry a kind the type does not list.
        const foreign: { type: string } = { type: 'minecraft:vanilla_layered' };
        expect(() => parseBiomeSource(foreign as BiomeSourceDefinition, noLists, 'stem.biome_source')).toThrow(
            'stem.biome_source: unknown biome source type "minecraft:vanilla_layered"'
        );
    });
});

const vanilla = findVanillaDatapack();

describe.skipIf(!vanilla)('the real vanilla biome parameter lists', { tags: ['real-data'] }, () => {
    if (!vanilla) return;

    it('resolves the two multi_noise presets through the data generator reports', () => {
        const ids = vanilla.listData('worldgen/multi_noise_biome_source_parameter_list');
        expect(ids).toEqual(['nether', 'overworld']);
        const lists = new Map<string, unknown>(ids.map((id) => [`minecraft:${id}`, vanilla.readBiomeParameters(id)]));
        for (const id of ids) {
            const stub = vanilla.readData(`worldgen/multi_noise_biome_source_parameter_list/${id}.json`);
            expect(stub).toEqual({ preset: `minecraft:${id}` });
        }

        const overworld = parseBiomeSource({ type: 'minecraft:multi_noise', preset: 'minecraft:overworld' }, lists);
        const nether = parseBiomeSource({ type: 'minecraft:multi_noise', preset: 'minecraft:nether' }, lists);
        expect(overworld).toBeInstanceOf(MultiNoiseBiomeSource);
        expect(nether).toBeInstanceOf(MultiNoiseBiomeSource);
        expect(nether.possibleBiomes()).toEqual([
            'minecraft:nether_wastes',
            'minecraft:soul_sand_valley',
            'minecraft:crimson_forest',
            'minecraft:warped_forest',
            'minecraft:basalt_deltas'
        ]);
        expect(overworld.possibleBiomes()).toContain('minecraft:plains');
        expect(overworld.possibleBiomes().length).toBeGreaterThan(50);
    });
});
