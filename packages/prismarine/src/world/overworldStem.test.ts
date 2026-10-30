import { describe, expect, it } from 'vitest';

import { normalizeWorldData } from '../config/normalizeWorldData';
import { DEFAULT_FLAT_SETTINGS, flatStem } from './generators/factories/flat';
import { OVERWORLD_NOISE_STEM } from './generators/factories/noise';
import { overworldStemOf } from './overworldStem';

const KINDS = ['minecraft:noise', 'minecraft:flat'];

describe('overworldStemOf', () => {
    it('chooses the noise stem for the default entry, which names only the normal preset', () => {
        const stem = overworldStemOf(normalizeWorldData({ seed: '1', preset: 'minecraft:normal' }, KINDS));

        expect(stem).toStrictEqual(OVERWORLD_NOISE_STEM);
    });

    it('chooses the noise stem for an entry with no preset at all', () => {
        expect(overworldStemOf(normalizeWorldData({ seed: '1' }, KINDS))).toStrictEqual(OVERWORLD_NOISE_STEM);
    });

    it("chooses the noise stem for the old generator: 'Overworld'", () => {
        expect(overworldStemOf(normalizeWorldData({ seed: 1, generator: 'Overworld' }, KINDS))).toStrictEqual(
            OVERWORLD_NOISE_STEM
        );
    });

    it("chooses the default flat stem for the old generator: 'Flat'", () => {
        expect(overworldStemOf(normalizeWorldData({ seed: 1, generator: 'Flat' }, KINDS))).toStrictEqual(
            flatStem('minecraft:overworld', DEFAULT_FLAT_SETTINGS)
        );
    });

    it('chooses the default flat stem for the flat preset', () => {
        expect(overworldStemOf(normalizeWorldData({ seed: 1, preset: 'minecraft:flat' }, KINDS))).toStrictEqual(
            flatStem('minecraft:overworld', DEFAULT_FLAT_SETTINGS)
        );
    });

    it("carries the old layers into the flat stem, namespaced, as generator: 'Flat' did", () => {
        const world = normalizeWorldData(
            {
                seed: 1,
                generator: 'Flat',
                layers: [
                    { block: 'bedrock', size: 1 },
                    { block: 'minecraft:stone', size: 3 }
                ]
            },
            KINDS
        );

        expect(overworldStemOf(world)).toStrictEqual({
            type: 'minecraft:overworld',
            generator: {
                type: 'minecraft:flat',
                settings: {
                    layers: [
                        { block: 'minecraft:bedrock', height: 1 },
                        { block: 'minecraft:stone', height: 3 }
                    ],
                    biome: 'minecraft:plains',
                    lakes: false,
                    features: false,
                    structureOverrides: []
                }
            }
        });
    });

    it('reads a flat generator written under dimensions the new way', () => {
        const world = normalizeWorldData(
            {
                seed: 1,
                dimensions: {
                    'minecraft:overworld': {
                        generator: {
                            type: 'minecraft:flat',
                            settings: {
                                layers: [{ block: 'minecraft:sandstone', height: 2 }],
                                biome: 'minecraft:desert'
                            }
                        }
                    }
                }
            },
            KINDS
        );

        expect(overworldStemOf(world).generator).toStrictEqual({
            type: 'minecraft:flat',
            settings: {
                layers: [{ block: 'minecraft:sandstone', height: 2 }],
                biome: 'minecraft:desert',
                lakes: false,
                features: false
            }
        });
    });

    it('binds the stem to the dimension type it is asked for', () => {
        const world = normalizeWorldData({ seed: 1, preset: 'minecraft:flat' }, KINDS);

        expect(overworldStemOf(world, 'jsprismarine:test').type).toBe('jsprismarine:test');
    });

    it('passes a dimensions entry of another kind through, so a registered kind is reachable', () => {
        const world = normalizeWorldData(
            { seed: 1, dimensions: { 'minecraft:overworld': { generator: { type: 'jsprismarine:held' } } } },
            KINDS
        );

        expect(overworldStemOf(world)).toStrictEqual({
            type: 'minecraft:overworld',
            generator: { type: 'jsprismarine:held', settings: undefined }
        });
    });
});
