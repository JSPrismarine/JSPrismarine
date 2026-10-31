import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { load } from '@jsprismarine/packs';
import type { LevelStem, WorldPreset } from '@jsprismarine/worldgen';
import { OVERWORLD_STEM_ID } from '@jsprismarine/worldgen';
import { afterAll, describe, expect, it } from 'vitest';

import { normalizeWorldData } from '../config/normalizeWorldData';
import { Dimensions } from './Dimension';
import { DEFAULT_FLAT_SETTINGS, flatStem } from './generators/factories/flat';
import { OVERWORLD_NOISE_STEM } from './generators/factories/noise';
import type { JavaWorldgenRegistries } from './generators/datadriven/javaWorldgenData';
import { loadJavaWorldgenRegistriesFrom } from './generators/datadriven/javaWorldgenData';
import { stub } from '../testing/stub.test.helper';
import { BUILT_IN_WORLD_PRESETS, dimensionTypesOf, loadOf, resolveStems } from './resolveStems';
import { THE_END_DIMENSION_TYPE_JSON, VANILLA_DIMENSION_TYPES } from './vanillaDimensionTypes';

const KINDS = ['minecraft:noise', 'minecraft:flat'];

const NETHER_STEM: LevelStem = {
    type: Dimensions.Nether.id,
    generator: {
        type: 'minecraft:noise',
        settings: 'minecraft:nether',
        biomeSource: { type: 'minecraft:multi_noise', preset: 'minecraft:nether' }
    }
};

const END_STEM: LevelStem = {
    type: Dimensions.TheEnd.id,
    generator: { type: 'minecraft:noise', settings: 'minecraft:end', biomeSource: { type: 'minecraft:the_end' } }
};

/** Java's `minecraft:normal` and `minecraft:flat`, as the datapack spells them. */
const PRESETS: ReadonlyMap<string, WorldPreset> = new Map([
    [
        'minecraft:normal',
        {
            dimensions: new Map([
                [OVERWORLD_STEM_ID, OVERWORLD_NOISE_STEM],
                [Dimensions.Nether.id, NETHER_STEM],
                [Dimensions.TheEnd.id, END_STEM]
            ])
        }
    ],
    [
        'minecraft:flat',
        {
            dimensions: new Map([
                [OVERWORLD_STEM_ID, flatStem(OVERWORLD_STEM_ID)],
                [Dimensions.Nether.id, NETHER_STEM],
                [Dimensions.TheEnd.id, END_STEM]
            ])
        }
    ]
]);

describe('resolveStems', () => {
    it('answers the preset alone for an entry with no overrides, in the preset order', () => {
        const stems = resolveStems(normalizeWorldData({ seed: '1' }, KINDS), PRESETS);

        expect([...stems.keys()]).toEqual([OVERWORLD_STEM_ID, Dimensions.Nether.id, Dimensions.TheEnd.id]);
        expect(stems.get(OVERWORLD_STEM_ID)).toStrictEqual(OVERWORLD_NOISE_STEM);
        expect(stems.get(Dimensions.Nether.id)).toBe(NETHER_STEM);
    });

    it('replaces one stem generator and keeps the preset type and the other stems', () => {
        const stems = resolveStems(
            normalizeWorldData(
                {
                    seed: '1',
                    dimensions: {
                        [OVERWORLD_STEM_ID]: {
                            generator: { type: 'minecraft:flat', settings: { layers: [], biome: 'minecraft:plains' } }
                        }
                    }
                },
                KINDS
            ),
            PRESETS
        );

        expect(stems.get(OVERWORLD_STEM_ID)).toStrictEqual({
            type: Dimensions.Overworld.id,
            generator: {
                type: 'minecraft:flat',
                settings: { layers: [], biome: 'minecraft:plains', lakes: false, features: false }
            }
        });
        expect(stems.get(Dimensions.Nether.id)).toBe(NETHER_STEM);
        expect(stems.size).toBe(3);
    });

    it('adds a dimension the preset lacks when the entry spells both its type and generator', () => {
        const stems = resolveStems(
            normalizeWorldData(
                {
                    seed: '1',
                    dimensions: {
                        'mypack:sky': {
                            type: 'mypack:sky_type',
                            generator: { type: 'minecraft:flat', settings: { layers: [], biome: 'minecraft:plains' } }
                        }
                    }
                },
                KINDS
            ),
            PRESETS
        );

        expect([...stems.keys()]).toEqual([
            OVERWORLD_STEM_ID,
            Dimensions.Nether.id,
            Dimensions.TheEnd.id,
            'mypack:sky'
        ]);
        expect(stems.get('mypack:sky')?.type).toBe('mypack:sky_type');
    });

    it('refuses an added dimension that leaves out its type or its generator', () => {
        expect(() =>
            resolveStems(
                normalizeWorldData({ seed: '1', dimensions: { 'mypack:sky': { type: 'mypack:sky_type' } } }, KINDS),
                PRESETS
            )
        ).toThrowError("dimensions['mypack:sky'] adds a dimension minecraft:normal lacks, so it needs a generator");
        expect(() =>
            resolveStems(
                normalizeWorldData(
                    { seed: '1', dimensions: { 'mypack:sky': { generator: { type: 'minecraft:debug' } } } },
                    KINDS
                ),
                PRESETS
            )
        ).toThrowError("dimensions['mypack:sky'] adds a dimension minecraft:normal lacks, so it needs a type");
    });

    it('refuses two dimensions that bind one dimension type, naming both', () => {
        expect(() =>
            resolveStems(
                normalizeWorldData(
                    {
                        seed: '1',
                        dimensions: {
                            'mypack:sky': { type: Dimensions.Nether.id, generator: { type: 'minecraft:debug' } }
                        }
                    },
                    KINDS
                ),
                PRESETS
            )
        ).toThrowError(
            'The minecraft:the_nether and mypack:sky dimensions both bind the dimension type minecraft:the_nether; a type backs one dimension per level'
        );
    });

    it('refuses a saved dimension that binds the type of a configured one', () => {
        expect(() =>
            resolveStems(normalizeWorldData({ seed: '1' }, KINDS), PRESETS, {
                seed: '1',
                dimensions: { 'mypack:sky': { type: Dimensions.TheEnd.id, generator: { type: 'minecraft:debug' } } }
            })
        ).toThrowError(
            'The minecraft:the_end and mypack:sky dimensions both bind the dimension type minecraft:the_end; a type backs one dimension per level'
        );
    });

    it('refuses a preset no registry defines, naming the ones that exist', () => {
        expect(() =>
            resolveStems(normalizeWorldData({ seed: '1', preset: 'minecraft:nope' }, KINDS), PRESETS)
        ).toThrowError('Unknown world preset minecraft:nope. Known presets: minecraft:normal, minecraft:flat');
    });

    it('keeps the stems a save was generated with over the config, and says which differ', () => {
        const lines: string[] = [];
        const stems = resolveStems(
            normalizeWorldData({ seed: '1', preset: 'minecraft:flat' }, KINDS),
            PRESETS,
            {
                seed: '1',
                dimensions: {
                    [OVERWORLD_STEM_ID]: OVERWORLD_NOISE_STEM,
                    [Dimensions.Nether.id]: NETHER_STEM,
                    [Dimensions.TheEnd.id]: END_STEM
                }
            },
            (line) => lines.push(line)
        );

        expect(stems.get(OVERWORLD_STEM_ID)).toStrictEqual(OVERWORLD_NOISE_STEM);
        expect(lines).toEqual([
            'minecraft:overworld was generated with minecraft:noise but the config says minecraft:flat; keeping the saved stem'
        ]);
    });

    it('logs nothing when the save and the config agree', () => {
        const lines: string[] = [];
        const stems = resolveStems(
            normalizeWorldData({ seed: '1', generator: 'Flat' }, KINDS),
            PRESETS,
            { seed: '1', dimensions: { [OVERWORLD_STEM_ID]: flatStem(OVERWORLD_STEM_ID, DEFAULT_FLAT_SETTINGS) } },
            (line) => lines.push(line)
        );

        expect(lines).toEqual([]);
        expect(stems.get(OVERWORLD_STEM_ID)).toStrictEqual(flatStem(OVERWORLD_STEM_ID));
        // A dimension the save never generated comes from the config.
        expect(stems.get(Dimensions.Nether.id)).toBe(NETHER_STEM);
    });

    it('keeps a saved dimension the config no longer names', () => {
        const lines: string[] = [];
        const stems = resolveStems(
            normalizeWorldData({ seed: '1' }, KINDS),
            PRESETS,
            {
                seed: '1',
                dimensions: { 'mypack:sky': { type: 'mypack:sky_type', generator: { type: 'minecraft:debug' } } }
            },
            (line) => lines.push(line)
        );

        expect(stems.get('mypack:sky')?.type).toBe('mypack:sky_type');
        expect(lines).toEqual([
            'mypack:sky was generated with minecraft:debug but the config no longer names it; keeping the saved stem'
        ]);
    });
});

describe('BUILT_IN_WORLD_PRESETS', () => {
    it('carries the two presets the old generator names stood for, Overworld only', () => {
        expect([...BUILT_IN_WORLD_PRESETS.keys()]).toEqual(['minecraft:normal', 'minecraft:flat']);
        expect([...BUILT_IN_WORLD_PRESETS.get('minecraft:flat')!.dimensions]).toEqual([
            [OVERWORLD_STEM_ID, flatStem(OVERWORLD_STEM_ID)]
        ]);
        expect([...BUILT_IN_WORLD_PRESETS.get('minecraft:normal')!.dimensions]).toEqual([
            [OVERWORLD_STEM_ID, OVERWORLD_NOISE_STEM]
        ]);
    });
});

describe('loadOf', () => {
    it('builds the Overworld at startup and every other stem on first entry unless the entry says otherwise', () => {
        const stems = resolveStems(
            normalizeWorldData({ seed: '1', dimensions: { [Dimensions.Nether.id]: { load: 'eager' } } }, KINDS),
            PRESETS
        );
        const load = loadOf(
            normalizeWorldData({ seed: '1', dimensions: { [Dimensions.Nether.id]: { load: 'eager' } } }, KINDS),
            stems
        );

        expect([...load]).toEqual([
            [OVERWORLD_STEM_ID, 'eager'],
            [Dimensions.Nether.id, 'eager'],
            [Dimensions.TheEnd.id, 'lazy']
        ]);
    });
});

describe('dimensionTypesOf', () => {
    const skyStem: LevelStem = { type: 'mypack:sky_type', generator: { type: 'minecraft:debug' } };

    it('answers the vanilla three without asking for the registries', () => {
        const stems = resolveStems(normalizeWorldData({ seed: '1' }, KINDS), PRESETS);
        const types = dimensionTypesOf(stems, () => {
            throw new Error('asked for the registries');
        });

        expect(types.get(Dimensions.Nether.id)).toBe(VANILLA_DIMENSION_TYPES['minecraft:the_nether']);
    });

    it('reads a custom type from the pack stack, and names one no pack defines', () => {
        const stems = new Map([
            [OVERWORLD_STEM_ID, OVERWORLD_NOISE_STEM],
            ['mypack:sky', skyStem]
        ]);
        const registries = () =>
            stub<JavaWorldgenRegistries>({
                dimensionTypes: new Map([['mypack:sky_type', THE_END_DIMENSION_TYPE_JSON]])
            });

        expect(dimensionTypesOf(stems, registries).get('mypack:sky_type')?.skybox).toBe('end');
        expect(() =>
            dimensionTypesOf(stems, () => stub<JavaWorldgenRegistries>({ dimensionTypes: new Map() }))
        ).toThrowError('The mypack:sky dimension names the dimension type mypack:sky_type, which no pack defines');
    });

    describe('over a datapack loaded through the pack stack', () => {
        const roots: string[] = [];
        afterAll(() => {
            for (const root of roots) rmSync(root, { recursive: true, force: true });
        });

        it('reaches a dimension type the datapack adds', () => {
            const root = mkdtempSync(join(tmpdir(), 'jsp-resolve-stems-datapack-'));
            roots.push(root);
            writeFileSync(
                join(root, 'pack.mcmeta'),
                JSON.stringify({ pack: { pack_format: 121, description: 'test' } })
            );
            mkdirSync(join(root, 'data', 'mypack', 'dimension_type'), { recursive: true });
            writeFileSync(
                join(root, 'data', 'mypack', 'dimension_type', 'sky_type.json'),
                JSON.stringify({ ...THE_END_DIMENSION_TYPE_JSON, min_y: 0, height: 512, logical_height: 512 })
            );

            const registries = loadJavaWorldgenRegistriesFrom(
                load([{ kind: 'datapack', path: root }]).definitions,
                join(root, 'no-reports')
            );
            const stems = new Map([
                [OVERWORLD_STEM_ID, OVERWORLD_NOISE_STEM],
                ['mypack:sky', skyStem]
            ]);

            expect(dimensionTypesOf(stems, () => registries).get('mypack:sky_type')).toMatchObject({
                minY: 0,
                height: 512,
                skybox: 'end'
            });
        });
    });
});
