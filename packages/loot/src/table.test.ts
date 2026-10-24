import type { ItemStack, RandomSource, ReferenceResolver } from '@jsprismarine/predicates';
import { PredicateContext, constantRandom, scriptedRandom } from '@jsprismarine/predicates';
import { describe, expect, it } from 'vitest';

import type { DynamicDropSource, SlotSourceView } from './model';
import { LOOT_ENTRY_TYPES, parseLootTable, rollLootTable } from './table';

const stackOf = (id: string, count = 1): ItemStack => ({ id, count, components: new Map() });

/** A source whose weighted draw is the named index, so a selection test states the roll directly. */
const drawing = (index: number): RandomSource => ({
    nextFloat: () => 0,
    nextInt: (bound) => Math.min(index, Math.max(0, bound - 1))
});

const contextFor = (random = constantRandom(0.5)): PredicateContext =>
    new PredicateContext({ parameterSet: 'chest', parameters: { origin: { x: 0, y: 64, z: 0 } }, random });

/** Rolls a table JSON once and returns the item ids it produced, in order. */
const rollIds = (
    json: unknown,
    options: {
        readonly random?: RandomSource;
        readonly luck?: number;
        readonly resolver?: ReferenceResolver;
        readonly dynamic?: DynamicDropSource;
        readonly slots?: SlotSourceView;
    } = {}
): readonly string[] => {
    const parsed = parseLootTable(json, { resolver: options.resolver });
    expect(parsed.diagnostics).toEqual([]);
    const context = contextFor(options.random);
    const rolled = rollLootTable(parsed.value, context, {
        luck: options.luck,
        dynamic: options.dynamic,
        slots: options.slots
    });
    expect(context.diagnostics.entries).toEqual([]);
    return rolled.map((stack) => stack.id);
};

const singlePool = (entries: readonly unknown[], extra: Readonly<Record<string, unknown>> = {}): unknown => ({
    type: 'minecraft:chest',
    pools: [{ rolls: 1, entries, ...extra }]
});

describe('the entry grammar', () => {
    it('registers the nine entry types of 26.3', () => {
        expect([...LOOT_ENTRY_TYPES].sort()).toEqual([
            'alternatives',
            'dynamic',
            'empty',
            'group',
            'item',
            'loot_table',
            'sequence',
            'slots',
            'tag'
        ]);
    });

    it('produces one stack for an item entry', () => {
        expect(rollIds(singlePool([{ type: 'minecraft:item', name: 'minecraft:diamond' }]))).toEqual([
            'minecraft:diamond'
        ]);
    });

    it('produces nothing for an empty entry', () => {
        expect(rollIds(singlePool([{ type: 'minecraft:empty' }]))).toEqual([]);
    });

    it('expands a tag entry into one candidate per member when expand is true', () => {
        const resolver: ReferenceResolver = {
            tag: () => ['minecraft:oak_planks', 'minecraft:birch_planks', 'minecraft:spruce_planks']
        };

        const ids = rollIds(
            singlePool([{ type: 'minecraft:tag', items: '#minecraft:planks', expand: true }]),
            // Three candidates of weight 1 each; the draw lands in the second.
            { random: scriptedRandom([0.5]), resolver }
        );

        expect(ids).toEqual(['minecraft:birch_planks']);
    });

    it('drops every member of a tag entry at once when expand is false', () => {
        const resolver: ReferenceResolver = { tag: () => ['minecraft:oak_planks', 'minecraft:birch_planks'] };

        expect(rollIds(singlePool([{ type: 'minecraft:tag', items: '#minecraft:planks' }]), { resolver })).toEqual([
            'minecraft:oak_planks',
            'minecraft:birch_planks'
        ]);
    });

    it('rolls an inline nested table for a loot_table entry', () => {
        const nested = {
            type: 'minecraft:chest',
            pools: [{ rolls: 1, entries: [{ type: 'minecraft:item', name: 'minecraft:emerald' }] }]
        };

        expect(rollIds(singlePool([{ type: 'minecraft:loot_table', value: nested }]))).toEqual(['minecraft:emerald']);
    });

    it('rolls a referenced table for a loot_table entry', () => {
        const resolver: ReferenceResolver = {
            element: (registry, id) =>
                registry === 'loot_table' && id === 'minecraft:chests/igloo'
                    ? {
                          type: 'minecraft:chest',
                          pools: [{ rolls: 1, entries: [{ type: 'minecraft:item', name: 'minecraft:golden_apple' }] }]
                      }
                    : undefined
        };

        expect(
            rollIds(singlePool([{ type: 'minecraft:loot_table', value: 'minecraft:chests/igloo' }]), { resolver })
        ).toEqual(['minecraft:golden_apple']);
    });

    it('asks the host for a dynamic entry', () => {
        const dynamic: DynamicDropSource = (name) =>
            name === 'minecraft:sherds' ? [stackOf('minecraft:brick'), stackOf('minecraft:flower_pot')] : undefined;

        expect(rollIds(singlePool([{ type: 'minecraft:dynamic', name: 'minecraft:sherds' }]), { dynamic })).toEqual([
            'minecraft:brick',
            'minecraft:flower_pot'
        ]);
    });

    it('asks the host for a slots entry', () => {
        const slots: SlotSourceView = () => [stackOf('minecraft:bread')];

        expect(
            rollIds(singlePool([{ type: 'minecraft:slots', slot_source: 'minecraft:container' }]), { slots })
        ).toEqual(['minecraft:bread']);
    });

    it('offers every child of a group as its own candidate', () => {
        const ids = rollIds(
            singlePool([
                {
                    type: 'minecraft:group',
                    children: [
                        { type: 'minecraft:item', name: 'minecraft:stick' },
                        { type: 'minecraft:item', name: 'minecraft:string' }
                    ]
                }
            ]),
            // Two candidates of weight 1; 0.9 of a bound of 2 lands in the second.
            { random: scriptedRandom([0.9]) }
        );

        expect(ids).toEqual(['minecraft:string']);
    });

    it('takes the first passing child of an alternatives entry', () => {
        expect(
            rollIds(
                singlePool([
                    {
                        type: 'minecraft:alternatives',
                        children: [
                            {
                                type: 'minecraft:item',
                                name: 'minecraft:diamond',
                                condition: { type: 'minecraft:random_chance', chance: 0 }
                            },
                            { type: 'minecraft:item', name: 'minecraft:coal' }
                        ]
                    }
                ])
            )
        ).toEqual(['minecraft:coal']);
    });

    it('stops a sequence entry at the first child whose condition fails', () => {
        expect(
            rollIds(
                singlePool([
                    {
                        type: 'minecraft:sequence',
                        children: [
                            { type: 'minecraft:item', name: 'minecraft:iron_ingot' },
                            {
                                type: 'minecraft:item',
                                name: 'minecraft:gold_ingot',
                                condition: { type: 'minecraft:random_chance', chance: 0 }
                            },
                            { type: 'minecraft:item', name: 'minecraft:diamond' }
                        ]
                    }
                ]),
                // Both surviving candidates weigh 1; the draw lands in the first.
                { random: scriptedRandom([0]) }
            )
        ).toEqual(['minecraft:iron_ingot']);
    });

    it('reports an unknown entry type and produces nothing', () => {
        const parsed = parseLootTable(singlePool([{ type: 'minecraft:treasure' }]));

        expect(parsed.diagnostics).toEqual([
            {
                severity: 'error',
                path: 'pools[0].entries[0]',
                message: 'unknown loot pool entry type minecraft:treasure'
            }
        ]);
        expect(rollLootTable(parsed.value, contextFor())).toEqual([]);
    });
});

describe('weight and quality', () => {
    it('scales weight by quality and luck the way Java does', () => {
        const table = singlePool([
            { type: 'minecraft:item', name: 'minecraft:common', weight: 10 },
            { type: 'minecraft:item', name: 'minecraft:rare', weight: 1, quality: 4 }
        ]);

        // Without luck the rare entry weighs 1 of 11 and covers only the last roll.
        expect(rollIds(table, { random: drawing(10) })).toEqual(['minecraft:rare']);
        expect(rollIds(table, { random: drawing(9) })).toEqual(['minecraft:common']);
        // With luck 2 it weighs floor(1 + 4 * 2) = 9 of 19, so it covers rolls 10 to 18.
        expect(rollIds(table, { luck: 2, random: drawing(10) })).toEqual(['minecraft:rare']);
        expect(rollIds(table, { luck: 2, random: drawing(9) })).toEqual(['minecraft:common']);
        expect(rollIds(table, { luck: 2, random: drawing(18) })).toEqual(['minecraft:rare']);
    });

    it('drops an entry whose weight falls to zero under negative luck', () => {
        const table = singlePool([
            { type: 'minecraft:item', name: 'minecraft:rare', weight: 1, quality: 2 },
            { type: 'minecraft:item', name: 'minecraft:common', weight: 4 }
        ]);

        // floor(1 + 2 * -1) is -1, clamped to 0, so only the common entry is a candidate.
        expect(rollIds(table, { luck: -1, random: drawing(3) })).toEqual(['minecraft:common']);
    });

    it('selects in proportion to weight over many draws', () => {
        const weights = { 'minecraft:a': 1, 'minecraft:b': 3, 'minecraft:c': 6 };
        const total = 10;
        const draws = 10_000;
        let cursor = 0;
        // 7919 is coprime with the weight total, so a cycling source visits every
        // integer of the range in turn and the observed counts are the exact
        // expected counts rather than a sample of them.
        const random: RandomSource = { nextFloat: () => 0, nextInt: (bound) => (cursor++ * 7919) % bound };
        const parsed = parseLootTable(
            singlePool(Object.entries(weights).map(([name, weight]) => ({ type: 'minecraft:item', name, weight })))
        );
        const counts = new Map<string, number>();

        for (let draw = 0; draw < draws; draw += 1) {
            for (const stack of rollLootTable(parsed.value, contextFor(random))) {
                counts.set(stack.id, (counts.get(stack.id) ?? 0) + 1);
            }
        }

        for (const [id, weight] of Object.entries(weights)) {
            expect(counts.get(id)).toBe((draws * weight) / total);
        }
    });
});

describe('conditions', () => {
    it('skips a pool whose condition fails', () => {
        expect(
            rollIds({
                type: 'minecraft:chest',
                pools: [
                    {
                        rolls: 1,
                        condition: { type: 'minecraft:random_chance', chance: 0 },
                        entries: [{ type: 'minecraft:item', name: 'minecraft:diamond' }]
                    },
                    { rolls: 1, entries: [{ type: 'minecraft:item', name: 'minecraft:dirt' }] }
                ]
            })
        ).toEqual(['minecraft:dirt']);
    });

    it('skips an entry whose condition fails', () => {
        expect(
            rollIds(
                singlePool([
                    {
                        type: 'minecraft:item',
                        name: 'minecraft:diamond',
                        condition: { type: 'minecraft:random_chance', chance: 0 }
                    },
                    { type: 'minecraft:item', name: 'minecraft:dirt' }
                ])
            )
        ).toEqual(['minecraft:dirt']);
    });
});

describe('rolls', () => {
    it('rolls a pool the number of times its provider gives', () => {
        expect(
            rollIds({
                type: 'minecraft:chest',
                pools: [{ rolls: 3, entries: [{ type: 'minecraft:item', name: 'minecraft:arrow' }] }]
            })
        ).toEqual(['minecraft:arrow', 'minecraft:arrow', 'minecraft:arrow']);
    });

    it('adds bonus rolls scaled by luck and floored', () => {
        const table = {
            type: 'minecraft:chest',
            pools: [{ rolls: 1, bonus_rolls: 0.6, entries: [{ type: 'minecraft:item', name: 'minecraft:arrow' }] }]
        };

        // floor(0.6 * 1) is 0, so luck 1 adds nothing.
        expect(rollIds(table, { luck: 1 })).toHaveLength(1);
        // floor(0.6 * 4) is 2.
        expect(rollIds(table, { luck: 4 })).toHaveLength(3);
    });

    it('reports a pool with no rolls', () => {
        const parsed = parseLootTable({
            type: 'minecraft:chest',
            pools: [{ entries: [{ type: 'minecraft:item', name: 'minecraft:arrow' }] }]
        });

        expect(parsed.diagnostics).toEqual([
            { severity: 'error', path: 'pools[0]', message: 'a loot pool needs rolls' }
        ]);
    });
});

describe('modifier order', () => {
    it('applies the entry modifier, then the pool modifier, then the table one', () => {
        const parsed = parseLootTable({
            type: 'minecraft:chest',
            modifier: { type: 'minecraft:set_count', count: 1, add: true },
            pools: [
                {
                    rolls: 1,
                    modifier: { type: 'minecraft:limit_count', limit: { max: 5 } },
                    entries: [
                        {
                            type: 'minecraft:item',
                            name: 'minecraft:cobblestone',
                            modifier: { type: 'minecraft:set_count', count: 10 }
                        }
                    ]
                }
            ]
        });
        expect(parsed.diagnostics).toEqual([]);

        // 10, clamped to 5, then raised by 1. Any other order of the three gives 2, 5, 10 or 11.
        expect(rollLootTable(parsed.value, contextFor()).map((stack) => stack.count)).toEqual([6]);
    });

    it('drops a stack a modifier discards', () => {
        expect(
            rollIds(
                singlePool([
                    { type: 'minecraft:item', name: 'minecraft:diamond', modifier: { type: 'minecraft:discard' } }
                ])
            )
        ).toEqual([]);
    });
});

describe('the table shape', () => {
    it('defaults the context key set to generic, as Java does', () => {
        expect(parseLootTable({ pools: [] }).value.parameterSet).toBe('generic');
    });

    it('keeps the random sequence id', () => {
        expect(
            parseLootTable({ type: 'minecraft:block', random_sequence: 'minecraft:blocks/coal_ore' }).value
                .randomSequence
        ).toBe('minecraft:blocks/coal_ore');
    });

    it('reports a context key set the registry does not have', () => {
        expect(parseLootTable({ type: 'minecraft:treasure_chest' }).diagnostics).toEqual([
            { severity: 'error', path: 'type', message: 'unknown loot context key set minecraft:treasure_chest' }
        ]);
    });

    it('reports when the roll context declares a different key set than the table', () => {
        const parsed = parseLootTable({ type: 'minecraft:block' });
        const context = contextFor();

        rollLootTable(parsed.value, context);

        expect(context.diagnostics.entries).toEqual([
            {
                severity: 'error',
                path: '',
                message: 'the table declares the block loot context but the roll supplied chest'
            }
        ]);
    });

    it('lists the tables it references', () => {
        const resolver: ReferenceResolver = {
            element: () => ({ type: 'minecraft:chest', pools: [] })
        };
        const parsed = parseLootTable(singlePool([{ type: 'minecraft:loot_table', value: 'minecraft:chests/igloo' }]), {
            resolver
        });

        expect(parsed.value.references).toEqual(['minecraft:chests/igloo']);
    });

    it('reports a cycle between two tables instead of recursing', () => {
        const tables: Readonly<Record<string, unknown>> = {
            'minecraft:a': {
                type: 'minecraft:chest',
                pools: [{ rolls: 1, entries: [{ type: 'minecraft:loot_table', value: 'minecraft:b' }] }]
            },
            'minecraft:b': {
                type: 'minecraft:chest',
                pools: [{ rolls: 1, entries: [{ type: 'minecraft:loot_table', value: 'minecraft:a' }] }]
            }
        };
        const resolver: ReferenceResolver = { element: (_registry, id) => tables[id] };

        const parsed = parseLootTable(tables['minecraft:a'], { resolver, path: 'minecraft:a', id: 'minecraft:a' });

        expect(parsed.diagnostics).toEqual([
            {
                severity: 'error',
                path: 'minecraft:b.pools[0].entries[0].value',
                message: 'loot_table reference minecraft:a is cyclic'
            }
        ]);
    });
});

describe('stack splitting', () => {
    it('splits a result above the item maximum into whole stacks', () => {
        const parsed = parseLootTable(
            singlePool([
                {
                    type: 'minecraft:item',
                    name: 'minecraft:cobblestone',
                    modifier: { type: 'minecraft:limit_count', limit: { min: 150 } }
                }
            ])
        );

        expect(rollLootTable(parsed.value, contextFor()).map((stack) => stack.count)).toEqual([64, 64, 22]);
    });

    it('leaves the counts alone when splitting is off', () => {
        const parsed = parseLootTable(
            singlePool([
                {
                    type: 'minecraft:item',
                    name: 'minecraft:cobblestone',
                    modifier: { type: 'minecraft:limit_count', limit: { min: 150 } }
                }
            ])
        );

        expect(rollLootTable(parsed.value, contextFor(), { split: false }).map((stack) => stack.count)).toEqual([150]);
    });
});
