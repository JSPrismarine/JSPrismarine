import { scriptedRandom } from '@jsprismarine/predicates';
import { describe, expect, it } from 'vitest';

import type { LootPackDefinitions } from './packs';
import { LootRegistry } from './registry';

const ORIGIN = { origin: { x: 0, y: 64, z: 0 } };

/** A pack stack shaped the way `@jsprismarine/packs` leaves one, with the loader's record around each file. */
const stackOf = (
    tables: Readonly<Record<string, unknown>>,
    extra: Partial<LootPackDefinitions> = {}
): LootPackDefinitions => ({
    lootTablesJava: new Map(Object.entries(tables).map(([id, data]) => [id, { data }])),
    ...extra
});

const chestOf = (name: string, random_sequence?: string): unknown => ({
    type: 'minecraft:chest',
    ...(random_sequence === undefined ? {} : { random_sequence }),
    pools: [{ rolls: 1, entries: [{ type: 'minecraft:item', name }] }]
});

describe('loading a pack stack', () => {
    it('lists the ids the stack registered', () => {
        const registry = new LootRegistry(
            stackOf({
                'minecraft:chests/igloo': chestOf('minecraft:bread'),
                'minecraft:blocks/stone': chestOf('minecraft:cobblestone')
            })
        );

        expect(registry.ids).toEqual(['minecraft:chests/igloo', 'minecraft:blocks/stone']);
    });

    it('compiles a table once and keeps it', () => {
        const registry = new LootRegistry(stackOf({ 'minecraft:chests/igloo': chestOf('minecraft:bread') }));

        expect(registry.table('minecraft:chests/igloo')).toBe(registry.table('minecraft:chests/igloo'));
    });

    it('answers nothing for an id the stack has not got', () => {
        const registry = new LootRegistry(stackOf({}));

        expect(registry.table('minecraft:chests/igloo')).toBeUndefined();
        expect(registry.diagnostics.entries).toEqual([]);
    });

    it('reports an unknown id on a roll and produces nothing', () => {
        const registry = new LootRegistry(stackOf({}));

        expect(registry.roll('minecraft:chests/igloo')).toEqual([]);
        expect(registry.diagnostics.entries).toEqual([
            { severity: 'error', path: 'minecraft:chests/igloo', message: 'unknown loot table minecraft:chests/igloo' }
        ]);
    });
});

describe('rolling through the registry', () => {
    it('takes the context key set from the table', () => {
        const registry = new LootRegistry(stackOf({ 'minecraft:chests/igloo': chestOf('minecraft:bread') }));

        expect(registry.roll('minecraft:chests/igloo', { parameters: ORIGIN }).map((stack) => stack.id)).toEqual([
            'minecraft:bread'
        ]);
        expect(registry.diagnostics.entries).toEqual([]);
    });

    it('resolves a reference to another table in the stack', () => {
        const registry = new LootRegistry(
            stackOf({
                'minecraft:chests/igloo': {
                    type: 'minecraft:chest',
                    pools: [
                        { rolls: 1, entries: [{ type: 'minecraft:loot_table', value: 'minecraft:chests/igloo_bonus' }] }
                    ]
                },
                'minecraft:chests/igloo_bonus': chestOf('minecraft:golden_apple')
            })
        );

        expect(registry.roll('minecraft:chests/igloo', { parameters: ORIGIN }).map((stack) => stack.id)).toEqual([
            'minecraft:golden_apple'
        ]);
        expect(registry.diagnostics.entries).toEqual([]);
    });

    it('resolves a predicate the stack registered', () => {
        const registry = new LootRegistry(
            stackOf(
                {
                    'minecraft:blocks/stone': {
                        type: 'minecraft:block',
                        pools: [
                            {
                                rolls: 1,
                                condition: 'minecraft:never',
                                entries: [{ type: 'minecraft:item', name: 'minecraft:cobblestone' }]
                            }
                        ]
                    }
                },
                {
                    predicates: new Map<string, unknown>([
                        ['minecraft:never', { data: { type: 'minecraft:random_chance', chance: 0 } }]
                    ])
                }
            )
        );

        expect(
            registry.roll('minecraft:blocks/stone', {
                parameters: {
                    ...ORIGIN,
                    block_state: { name: 'minecraft:stone' },
                    tool: { id: 'minecraft:air', count: 1, components: new Map() }
                }
            })
        ).toEqual([]);
        expect(registry.diagnostics.entries).toEqual([]);
    });

    it('lets a caller script the draw instead of the sequence', () => {
        const registry = new LootRegistry(
            stackOf({
                'minecraft:chests/igloo': {
                    type: 'minecraft:chest',
                    pools: [
                        {
                            rolls: 1,
                            entries: [
                                { type: 'minecraft:item', name: 'minecraft:bread' },
                                { type: 'minecraft:item', name: 'minecraft:apple' }
                            ]
                        }
                    ]
                }
            })
        );

        expect(
            registry
                .roll('minecraft:chests/igloo', { parameters: ORIGIN, random: scriptedRandom([0.9]) })
                .map((stack) => stack.id)
        ).toEqual(['minecraft:apple']);
    });
});

describe('random sequence determinism', () => {
    const stack = stackOf({
        'minecraft:chests/igloo': {
            type: 'minecraft:chest',
            random_sequence: 'minecraft:chests/igloo',
            pools: [
                {
                    rolls: 1,
                    entries: [
                        { type: 'minecraft:item', name: 'minecraft:bread' },
                        { type: 'minecraft:item', name: 'minecraft:apple' },
                        { type: 'minecraft:item', name: 'minecraft:carrot' },
                        { type: 'minecraft:item', name: 'minecraft:potato' }
                    ]
                }
            ]
        },
        'minecraft:chests/other': chestOf('minecraft:bread', 'minecraft:chests/other')
    });

    /** Twenty consecutive draws from a fresh registry, which is one world's run of the table. */
    const draws = (worldSeed: bigint): readonly string[] => {
        const registry = new LootRegistry(stack, { worldSeed });
        return Array.from(
            { length: 20 },
            () => registry.roll('minecraft:chests/igloo', { parameters: ORIGIN })[0]?.id ?? ''
        );
    };

    it('repeats the same draws for the same world seed and table', () => {
        expect(draws(1234n)).toEqual(draws(1234n));
    });

    it('draws differently for another world seed', () => {
        expect(draws(1234n)).not.toEqual(draws(4321n));
    });

    it('advances the stream rather than replaying it', () => {
        const registry = new LootRegistry(stack, { worldSeed: 1234n });
        const drawn = Array.from(
            { length: 40 },
            () => registry.roll('minecraft:chests/igloo', { parameters: ORIGIN })[0]?.id
        );

        expect(new Set(drawn).size).toBeGreaterThan(1);
    });
});

describe('cycle detection', () => {
    const cyclic = stackOf({
        'minecraft:a': {
            type: 'minecraft:chest',
            pools: [{ rolls: 1, entries: [{ type: 'minecraft:loot_table', value: 'minecraft:b' }] }]
        },
        'minecraft:b': {
            type: 'minecraft:chest',
            pools: [{ rolls: 1, entries: [{ type: 'minecraft:loot_table', value: 'minecraft:a' }] }]
        },
        'minecraft:c': chestOf('minecraft:bread')
    });

    it('finds the chain that closes a cycle', () => {
        expect(new LootRegistry(cyclic).cycles).toEqual([['minecraft:a', 'minecraft:b', 'minecraft:a']]);
    });

    it('finds a table that references itself', () => {
        const registry = new LootRegistry(
            stackOf({
                'minecraft:a': {
                    type: 'minecraft:chest',
                    pools: [{ rolls: 1, entries: [{ type: 'minecraft:loot_table', value: 'minecraft:a' }] }]
                }
            })
        );

        expect(registry.cycles).toEqual([['minecraft:a', 'minecraft:a']]);
    });

    it('finds nothing in an acyclic stack', () => {
        expect(new LootRegistry(stackOf({ 'minecraft:c': chestOf('minecraft:bread') })).cycles).toEqual([]);
    });

    it('reports every cycle as a diagnostic when the stack is validated', () => {
        const registry = new LootRegistry(cyclic);

        expect(registry.validate()).toContainEqual({
            severity: 'error',
            path: 'minecraft:a',
            message: 'loot table reference cycle: minecraft:a -> minecraft:b -> minecraft:a'
        });
    });

    it('reports a cycle once however often it is validated', () => {
        const registry = new LootRegistry(cyclic);

        registry.validate();
        const cycleReports = registry
            .validate()
            .filter((entry) => entry.message.startsWith('loot table reference cycle'));

        expect(cycleReports).toHaveLength(1);
    });

    it('compiles every table when it validates, so a parse fault surfaces at load', () => {
        const registry = new LootRegistry(
            stackOf({ 'minecraft:broken': { type: 'minecraft:chest', pools: [{ rolls: 1, entries: [{}] }] } })
        );

        expect(registry.validate()).toEqual([
            {
                severity: 'error',
                path: 'minecraft:broken.pools[0].entries[0]',
                message: 'a loot pool entry needs a type'
            }
        ]);
    });
});
