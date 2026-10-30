import { describe, expect, it } from 'vitest';

import { normalizeWorldData, worldDataOf } from './normalizeWorldData';

const KINDS = ['minecraft:noise', 'minecraft:flat'];

describe('normalizeWorldData', () => {
    it('reads an entry with no generator as the normal preset', () => {
        const normalized = normalizeWorldData({ seed: '1', provider: 'LevelDB' }, KINDS);

        expect(normalized).toStrictEqual({
            seed: '1',
            provider: 'LevelDB',
            preset: 'minecraft:normal',
            dimensions: {},
            deprecations: []
        });
    });

    it.each(['Overworld', 'overworld'])('translates generator %s to the normal preset', (generator) => {
        const normalized = normalizeWorldData({ seed: 1, generator }, KINDS);

        expect(normalized.preset).toBe('minecraft:normal');
        expect(normalized.dimensions).toStrictEqual({});
        expect(normalized.deprecations).toStrictEqual([
            `\`generator: '${generator}'\` is deprecated; write \`preset: 'minecraft:normal'\`.`
        ]);
    });

    it('translates generator Flat without layers to the flat preset', () => {
        const normalized = normalizeWorldData({ seed: 1, generator: 'Flat' }, KINDS);

        expect(normalized.preset).toBe('minecraft:flat');
        expect(normalized.dimensions).toStrictEqual({});
        expect(normalized.deprecations).toStrictEqual([
            "`generator: 'Flat'` is deprecated; write `preset: 'minecraft:flat'`."
        ]);
    });

    it('translates generator Flat with layers to an Overworld flat stem', () => {
        const normalized = normalizeWorldData(
            {
                seed: 1,
                generator: 'Flat',
                layers: [
                    { block: 'minecraft:bedrock', size: 1 },
                    { block: 'minecraft:dirt', size: 2 }
                ]
            },
            KINDS
        );

        expect(normalized.preset).toBe('minecraft:flat');
        expect(normalized.dimensions).toStrictEqual({
            'minecraft:overworld': {
                generator: {
                    type: 'minecraft:flat',
                    settings: {
                        biome: 'minecraft:plains',
                        layers: [
                            { block: 'minecraft:bedrock', height: 1 },
                            { block: 'minecraft:dirt', height: 2 }
                        ],
                        lakes: false,
                        features: false,
                        structure_overrides: []
                    }
                }
            }
        });
        expect(normalized.deprecations).toStrictEqual([
            "`generator: 'Flat'` is deprecated; write `preset: 'minecraft:flat'`.",
            "`layers` is deprecated; write the layers as `{ block, height }` under `dimensions['minecraft:overworld'].generator.settings.layers`."
        ]);
    });

    it('refuses any other generator string and names the kinds', () => {
        expect(() => normalizeWorldData({ seed: 1, generator: 'Nether' }, KINDS)).toThrow(
            /Invalid generator with id Nether.*minecraft:noise, minecraft:flat/
        );
    });

    it('leaves layers out of the translation when the generator was not Flat', () => {
        const normalized = normalizeWorldData({ seed: 1, layers: [{ block: 'minecraft:stone', size: 3 }] }, KINDS);

        expect(normalized.preset).toBe('minecraft:normal');
        expect(normalized.dimensions).toStrictEqual({});
        expect(normalized.deprecations).toStrictEqual([
            "`layers` is deprecated and has no effect without `generator: 'Flat'`; remove it."
        ]);
    });

    it('keeps a preset and an Overworld generator the entry already spells the new way', () => {
        const generator = { type: 'minecraft:flat', settings: { layers: [{ block: 'minecraft:stone', height: 1 }] } };
        const normalized = normalizeWorldData(
            {
                seed: 1,
                generator: 'Flat',
                layers: [{ block: 'minecraft:dirt', size: 1 }],
                preset: 'minecraft:large_biomes',
                dimensions: {
                    'minecraft:overworld': { generator, load: 'eager' },
                    'minecraft:the_end': { load: 'eager' }
                }
            },
            KINDS
        );

        expect(normalized.preset).toBe('minecraft:large_biomes');
        expect(normalized.dimensions).toStrictEqual({
            'minecraft:overworld': { generator, load: 'eager' },
            'minecraft:the_end': { load: 'eager' }
        });
        expect(normalized.deprecations).toHaveLength(2);
    });

    it('passes an entry in the new shape through with no deprecations', () => {
        const entry = {
            seed: '7',
            provider: 'LevelDB',
            preset: 'minecraft:amplified',
            dimensions: { 'minecraft:the_nether': { load: 'eager' as const } }
        };

        const normalized = normalizeWorldData(entry, KINDS);

        expect(normalized).toStrictEqual({ ...entry, deprecations: [] });
    });
});

describe('worldDataOf', () => {
    it('writes the new keys and leaves out an absent provider and empty dimensions', () => {
        expect(worldDataOf(normalizeWorldData({ seed: 1, generator: 'Overworld' }, KINDS))).toStrictEqual({
            preset: 'minecraft:normal',
            seed: 1
        });
    });

    it('keeps the provider and the translated dimensions', () => {
        const written = worldDataOf(
            normalizeWorldData(
                { seed: '1', provider: 'LevelDB', generator: 'Flat', layers: [{ block: 'minecraft:stone', size: 1 }] },
                KINDS
            )
        );

        expect(Object.keys(written)).toStrictEqual(['preset', 'provider', 'seed', 'dimensions']);
        expect(written.dimensions?.['minecraft:overworld']?.generator?.type).toBe('minecraft:flat');
    });
});
