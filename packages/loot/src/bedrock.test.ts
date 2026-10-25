import type { ItemStack, RandomSource, ReferenceResolver } from '@jsprismarine/predicates';
import { PredicateContext, constantRandom, scriptedRandom } from '@jsprismarine/predicates';
import { describe, expect, it } from 'vitest';

import type { BedrockDifficulty, LootDifficultyView } from './dialect';
import { LootRegistry } from './registry';
import { parseLootTable, rollLootTable } from './table';

/**
 * Bedrock's spelling of the table grammar: plural `conditions`, the three
 * chance conditions, `tiers`, the pools an entry nests, and a `loot_table`
 * entry that names a pack-relative path.
 */

const contextFor = (random: RandomSource = constantRandom(0.5)): PredicateContext =>
    new PredicateContext({ parameterSet: 'generic', parameters: { origin: { x: 0, y: 64, z: 0 } }, random });

const difficultyOf = (level: BedrockDifficulty, scale = 1): LootDifficultyView => ({
    level: () => level,
    scale: () => scale
});

/** Rolls one Bedrock table JSON and returns the ids it produced, in order. */
const rollIds = (
    json: unknown,
    options: {
        readonly random?: RandomSource;
        readonly resolver?: ReferenceResolver;
        readonly difficulty?: LootDifficultyView;
    } = {}
): readonly string[] => {
    const parsed = parseLootTable(json, {
        dialect: 'bedrock',
        difficulty: options.difficulty,
        resolver: options.resolver
    });
    expect(parsed.diagnostics).toEqual([]);

    return rollLootTable(parsed.value, contextFor(options.random)).map((stack: ItemStack) => stack.id);
};

const sword = { type: 'item', name: 'minecraft:iron_sword', weight: 1 };

describe('the plural conditions array', () => {
    const gated = (conditions: readonly unknown[]): unknown => ({
        pools: [{ rolls: 1, conditions, entries: [sword] }]
    });

    it('gates the pool it sits on', () => {
        const table = gated([{ condition: 'random_chance', chance: 0.2 }]);

        expect(rollIds(table, { random: scriptedRandom([0.1]) })).toEqual(['minecraft:iron_sword']);
        expect(rollIds(table, { random: scriptedRandom([0.9]) })).toEqual([]);
    });

    it('needs every condition in the array to pass', () => {
        const table = gated([
            { condition: 'random_chance', chance: 0.5 },
            { condition: 'random_chance', chance: 0.5 }
        ]);

        expect(rollIds(table, { random: scriptedRandom([0.1, 0.1]) })).toEqual(['minecraft:iron_sword']);
        expect(rollIds(table, { random: scriptedRandom([0.1, 0.9]) })).toEqual([]);
    });

    it('gates an entry as well as a pool', () => {
        const table = {
            pools: [
                {
                    rolls: 1,
                    entries: [{ ...sword, conditions: [{ condition: 'random_chance', chance: 0.2 }] }]
                }
            ]
        };

        expect(rollIds(table, { random: scriptedRandom([0.9]) })).toEqual([]);
    });

    it('closes the gate on a condition this package does not implement', () => {
        const table = gated([{ condition: 'has_mark_variant', value: 1 }]);
        const { value, diagnostics } = parseLootTable(table, { dialect: 'bedrock' });

        expect(diagnostics).toEqual([
            {
                severity: 'error',
                path: 'pools[0].conditions[0]',
                message: 'this package does not implement the bedrock loot condition has_mark_variant'
            }
        ]);
        expect(rollLootTable(value, contextFor())).toEqual([]);
    });
});

describe('the three chance conditions', () => {
    it('random_chance draws against its stated chance', () => {
        const table = { pools: [{ rolls: 1, conditions: [{ condition: 'random_chance', chance: 0.2 }], entries: [sword] }] };

        expect(rollIds(table, { random: scriptedRandom([0.199]) })).toEqual(['minecraft:iron_sword']);
        expect(rollIds(table, { random: scriptedRandom([0.201]) })).toEqual([]);
    });

    it('random_difficulty_chance takes the chance its difficulty names', () => {
        const table = {
            pools: [
                {
                    rolls: 1,
                    conditions: [{ condition: 'random_difficulty_chance', default_chance: 1, peaceful: 0, easy: 0 }],
                    entries: [sword]
                }
            ]
        };
        const roll = (level: BedrockDifficulty): readonly string[] =>
            rollIds(table, { random: scriptedRandom([0.5]), difficulty: difficultyOf(level) });

        expect(roll('peaceful')).toEqual([]);
        expect(roll('easy')).toEqual([]);
        expect(roll('normal')).toEqual(['minecraft:iron_sword']);
        expect(roll('hard')).toEqual(['minecraft:iron_sword']);
    });

    it('random_regional_difficulty_chance scales its maximum by the region', () => {
        const table = {
            pools: [
                {
                    rolls: 1,
                    conditions: [{ condition: 'random_regional_difficulty_chance', max_chance: 0.5 }],
                    entries: [sword]
                }
            ]
        };
        const roll = (scale: number, draw: number): readonly string[] =>
            rollIds(table, { random: scriptedRandom([draw]), difficulty: difficultyOf('normal', scale) });

        expect(roll(1, 0.4)).toEqual(['minecraft:iron_sword']);
        expect(roll(0.5, 0.4)).toEqual([]);
        expect(roll(0.5, 0.2)).toEqual(['minecraft:iron_sword']);
        expect(roll(0, 0)).toEqual([]);
    });

    it('defaults to normal in a fully ramped region, so a stated chance is the real one', () => {
        const table = {
            pools: [
                {
                    rolls: 1,
                    conditions: [{ condition: 'random_regional_difficulty_chance', max_chance: 0.05 }],
                    entries: [sword]
                }
            ]
        };

        expect(rollIds(table, { random: scriptedRandom([0.049]) })).toEqual(['minecraft:iron_sword']);
        expect(rollIds(table, { random: scriptedRandom([0.051]) })).toEqual([]);
    });
});

describe('tiers', () => {
    const ladder = (tiers: unknown): unknown => ({
        pools: [
            {
                tiers,
                entries: [
                    { type: 'item', name: 'minecraft:leather_helmet' },
                    { type: 'item', name: 'minecraft:gold_helmet' },
                    { type: 'item', name: 'minecraft:iron_helmet' },
                    { type: 'item', name: 'minecraft:diamond_helmet' }
                ]
            }
        ]
    });

    /** Draws rung `index` and misses every bonus roll. */
    const landingOn = (index: number): RandomSource => ({
        nextFloat: () => 1,
        nextInt: (bound) => Math.min(index, Math.max(0, bound - 1))
    });

    it('draws within the opening range', () => {
        const table = ladder({ initial_range: 2, bonus_rolls: 3, bonus_chance: 0.1 });

        expect(rollIds(table, { random: landingOn(0) })).toEqual(['minecraft:leather_helmet']);
        expect(rollIds(table, { random: landingOn(1) })).toEqual(['minecraft:gold_helmet']);
    });

    it('climbs one rung per bonus roll that hits', () => {
        const table = ladder({ initial_range: 1, bonus_rolls: 3, bonus_chance: 0.5 });

        // nextInt lands on rung 0, then the three bonus floats decide.
        expect(rollIds(table, { random: scriptedRandom([0.1, 0.9, 0.9]) })).toEqual(['minecraft:gold_helmet']);
        expect(rollIds(table, { random: scriptedRandom([0.1, 0.1, 0.9]) })).toEqual(['minecraft:iron_helmet']);
        expect(rollIds(table, { random: scriptedRandom([0.1, 0.1, 0.1]) })).toEqual(['minecraft:diamond_helmet']);
    });

    it('stops at the last entry however many bonuses hit', () => {
        const table = ladder({ initial_range: 3, bonus_rolls: 6, bonus_chance: 1 });

        expect(rollIds(table, { random: constantRandom(0) })).toEqual(['minecraft:diamond_helmet']);
    });

    it('needs no rolls, and defaults a tiers that states only its range', () => {
        const table = ladder({ initial_range: 1 });

        expect(rollIds(table, { random: constantRandom(0) })).toEqual(['minecraft:leather_helmet']);
    });

    it('ignores weight, because the ladder is the written order', () => {
        const table = {
            pools: [
                {
                    tiers: { initial_range: 2 },
                    entries: [
                        { type: 'item', name: 'minecraft:leather_helmet', weight: 1 },
                        { type: 'item', name: 'minecraft:gold_helmet', weight: 999 }
                    ]
                }
            ]
        };

        expect(rollIds(table, { random: landingOn(0) })).toEqual(['minecraft:leather_helmet']);
    });
});

describe('the pools an entry nests', () => {
    /** The armor cascade in miniature: a helmet, then a chestplate at a difficulty chance. */
    const cascade = {
        pools: [
            {
                rolls: 1,
                entries: [
                    {
                        type: 'item',
                        name: 'minecraft:leather_helmet',
                        pools: [
                            {
                                rolls: 1,
                                conditions: [
                                    { condition: 'random_difficulty_chance', default_chance: 0.5, peaceful: 0 }
                                ],
                                entries: [{ type: 'item', name: 'minecraft:leather_chestplate' }]
                            }
                        ]
                    }
                ]
            }
        ]
    };

    it('rolls them once the entry is drawn', () => {
        expect(rollIds(cascade, { random: scriptedRandom([0.1]) })).toEqual([
            'minecraft:leather_helmet',
            'minecraft:leather_chestplate'
        ]);
    });

    it('leaves the entry own stack alone when the nested pool is gated shut', () => {
        expect(rollIds(cascade, { random: scriptedRandom([0.9]) })).toEqual(['minecraft:leather_helmet']);
    });

    it('produces nothing nested when the entry is never drawn', () => {
        const gated = {
            pools: [
                {
                    rolls: 1,
                    conditions: [{ condition: 'random_chance', chance: 0.2 }],
                    entries: cascade.pools[0]!.entries
                }
            ]
        };

        expect(rollIds(gated, { random: scriptedRandom([0.9]) })).toEqual([]);
    });
});

describe('a loot_table entry that names a path', () => {
    const stack = (tables: Readonly<Record<string, unknown>>): ReferenceResolver => ({
        element: (registry, id) => (registry === 'loot_table' ? tables[id] : undefined)
    });

    it('resolves the pack-relative path the behavior pack keys it under', () => {
        const resolver = stack({
            'loot_tables/entities/armor_set_leather.json': {
                pools: [{ rolls: 1, entries: [{ type: 'item', name: 'minecraft:leather_helmet' }] }]
            }
        });

        const rolled = rollIds(
            {
                pools: [
                    {
                        rolls: 1,
                        entries: [{ type: 'loot_table', name: 'loot_tables/entities/armor_set_leather.json' }]
                    }
                ]
            },
            { resolver }
        );

        expect(rolled).toEqual(['minecraft:leather_helmet']);
    });

    it('reports a path the stack does not hold', () => {
        const { diagnostics } = parseLootTable(
            { pools: [{ rolls: 1, entries: [{ type: 'loot_table', name: 'loot_tables/missing.json' }] }] },
            { dialect: 'bedrock', resolver: stack({}) }
        );

        expect(diagnostics).toEqual([
            {
                severity: 'error',
                path: 'pools[0].entries[0].name',
                message: 'unknown loot_table loot_tables/missing.json'
            }
        ]);
    });

    it('reports a path that leads back to the table it started from', () => {
        const registry = new LootRegistry(
            {
                lootTablesJava: new Map<string, unknown>([
                    [
                        'loot_tables/a.json',
                        { pools: [{ rolls: 1, entries: [{ type: 'loot_table', name: 'loot_tables/a.json' }] }] }
                    ]
                ])
            },
            { dialect: 'bedrock' }
        );

        registry.table('loot_tables/a.json');

        expect(registry.diagnostics.errors.map((entry) => entry.message)).toEqual([
            'loot_table reference loot_tables/a.json is cyclic'
        ]);
    });
});

describe('what the bedrock dialect reports and does not apply', () => {
    it('warns about the item functions rather than passing them over in silence', () => {
        const { diagnostics } = parseLootTable(
            {
                pools: [
                    {
                        rolls: 1,
                        entries: [{ ...sword, functions: [{ function: 'enchant_random_gear', chance: 0.25 }] }]
                    }
                ]
            },
            { dialect: 'bedrock' }
        );

        expect(diagnostics).toEqual([
            {
                severity: 'warning',
                path: 'pools[0].entries[0].functions',
                message: 'this package reads no functions on a bedrock loot item entry, so the item functions is lost'
            }
        ]);
    });

    it('reports the singular java spelling, which a bedrock table should not carry', () => {
        const { diagnostics } = parseLootTable(
            { pools: [{ rolls: 1, condition: { type: 'minecraft:random_chance', chance: 1 }, entries: [sword] }] },
            { dialect: 'bedrock' }
        );

        expect(diagnostics).toEqual([
            {
                severity: 'error',
                path: 'pools[0].condition',
                message: 'the bedrock loot pool grammar has no condition member, so nothing reads it'
            }
        ]);
    });
});
