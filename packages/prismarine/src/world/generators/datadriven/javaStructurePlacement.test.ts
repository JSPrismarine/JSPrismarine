import { describe, expect, it } from 'vitest';

import { candidateChunksIn, chooseStructure, createBiomeExpander, loadStructureSets } from './javaStructurePlacement';

const spread = (overrides: Record<string, unknown> = {}) => ({
    placement: { type: 'minecraft:random_spread', spacing: 32, separation: 8, salt: 10387312, ...overrides },
    structures: [{ structure: 'minecraft:village_plains', weight: 1 }]
});

describe('candidateChunksIn', () => {
    const placement = {
        type: 'minecraft:random_spread',
        spacing: 32,
        separation: 8,
        salt: 10387312,
        frequency: 1,
        frequencyReductionMethod: 'default',
        locateOffset: [0, 0, 0],
        spreadType: 'linear'
    } as const;

    it('finds one chunk per region the range covers', () => {
        const found = candidateChunksIn(placement, 1234n, {
            minChunkX: 0,
            minChunkZ: 0,
            maxChunkX: 63,
            maxChunkZ: 63
        });

        expect(found).toHaveLength(4);
        for (const chunk of found) {
            expect(chunk.x).toBeGreaterThanOrEqual(0);
            expect(chunk.x).toBeLessThanOrEqual(63);
        }
    });

    it('answers the same for a window inside a region as for the whole region', () => {
        const whole = candidateChunksIn(placement, 1234n, {
            minChunkX: 0,
            minChunkZ: 0,
            maxChunkX: 31,
            maxChunkZ: 31
        });
        const chunk = whole[0]!;
        const window = candidateChunksIn(placement, 1234n, {
            minChunkX: chunk.x - 1,
            minChunkZ: chunk.z - 1,
            maxChunkX: chunk.x + 1,
            maxChunkZ: chunk.z + 1
        });

        expect(window).toEqual([chunk]);
    });

    it('offers only the origin chunk for a dimension origin placement', () => {
        const origin = {
            type: 'minecraft:dimension_origin',
            frequency: 1,
            frequencyReductionMethod: 'default',
            locateOffset: [0, 0, 0],
            salt: 0
        } as const;

        expect(candidateChunksIn(origin, 1234n, { minChunkX: -4, minChunkZ: -4, maxChunkX: 4, maxChunkZ: 4 })).toEqual([
            { x: 0, z: 0 }
        ]);
        expect(
            candidateChunksIn(origin, 1234n, { minChunkX: 10, minChunkZ: 10, maxChunkX: 20, maxChunkZ: 20 })
        ).toEqual([]);
    });
});

describe('loadStructureSets', () => {
    const sets = new Map<string, unknown>([
        ['minecraft:villages', spread()],
        ['minecraft:nether_complexes', { ...spread(), structures: [{ structure: 'minecraft:fortress', weight: 1 }] }],
        ['minecraft:broken', { placement: { type: 'minecraft:nonsense' }, structures: [] }]
    ]);

    const biomesOf = (structure: string) =>
        structure === 'minecraft:village_plains' ? new Set(['minecraft:plains']) : new Set(['minecraft:nether_wastes']);

    it('keeps only the sets whose structures can reach a biome this dimension has', () => {
        const loaded = loadStructureSets(sets, biomesOf, (biome) => biome === 'minecraft:plains');

        expect(loaded.map((entry) => entry.id)).toEqual(['minecraft:villages']);
    });

    it('skips a set it cannot read rather than failing the world', () => {
        const loaded = loadStructureSets(sets, biomesOf, () => true);

        expect(loaded.map((entry) => entry.id)).toEqual(['minecraft:villages', 'minecraft:nether_complexes']);
    });
});

describe('chooseStructure', () => {
    it('draws by weight and gives the same answer for the same chunk', () => {
        const set = {
            placement: {
                type: 'minecraft:random_spread',
                spacing: 32,
                separation: 8,
                salt: 0,
                frequency: 1,
                frequencyReductionMethod: 'default',
                locateOffset: [0, 0, 0],
                spreadType: 'linear'
            },
            structures: [
                { structure: 'minecraft:village_plains', weight: 1 },
                { structure: 'minecraft:village_desert', weight: 1 }
            ]
        } as const;

        const first = chooseStructure(set, 1234n, 4, -7);
        expect(first).toBe(chooseStructure(set, 1234n, 4, -7));
        expect(['minecraft:village_plains', 'minecraft:village_desert']).toContain(first);
    });

    it('answers undefined for a set with no structures', () => {
        expect(
            chooseStructure(
                {
                    placement: {
                        type: 'minecraft:dimension_origin',
                        salt: 0,
                        frequency: 1,
                        frequencyReductionMethod: 'default',
                        locateOffset: [0, 0, 0]
                    },
                    structures: []
                },
                1234n,
                0,
                0
            )
        ).toBeUndefined();
    });
});

describe('createBiomeExpander', () => {
    const tags = new Map<string, unknown>([
        ['minecraft:has_structure/village_plains', { values: ['minecraft:plains', '#minecraft:is_meadow'] }],
        ['minecraft:is_meadow', { values: [{ id: 'minecraft:meadow', required: false }, '#minecraft:loop'] }],
        ['minecraft:loop', { values: ['#minecraft:is_meadow'] }]
    ]);

    it('expands a tag reference through its nested references', () => {
        const expand = createBiomeExpander(tags);

        expect([...expand('#minecraft:has_structure/village_plains')].sort()).toEqual([
            'minecraft:meadow',
            'minecraft:plains'
        ]);
    });

    it('reads a bare identifier and a list of them', () => {
        const expand = createBiomeExpander(tags);

        expect([...expand('minecraft:plains')]).toEqual(['minecraft:plains']);
        expect([...expand(['minecraft:plains', 'minecraft:desert'])].sort()).toEqual([
            'minecraft:desert',
            'minecraft:plains'
        ]);
    });

    it('answers nothing for a reference this server does not carry', () => {
        expect([...createBiomeExpander(tags)('#minecraft:missing')]).toEqual([]);
        expect([...createBiomeExpander(tags)(undefined)]).toEqual([]);
    });
});
