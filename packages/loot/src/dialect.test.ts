import type { ItemStack } from '@jsprismarine/predicates';
import { PredicateContext, constantRandom } from '@jsprismarine/predicates';
import { describe, expect, it } from 'vitest';

import { LootGrammarError, parseLootTable, rollLootTable } from './table';

/**
 * What the evaluator does with a key it does not read and a condition it does
 * not implement. Both used to pass without a word, which is the failure this
 * covers: an ignored gate and an open gate are the same thing to a roll.
 */

const contextFor = (): PredicateContext =>
    new PredicateContext({
        parameterSet: 'chest',
        parameters: { origin: { x: 0, y: 64, z: 0 } },
        random: constantRandom(0.5)
    });

/** The item ids one table JSON rolls, ignoring what it reported. */
const rollIds = (json: unknown): readonly string[] => {
    const { value } = parseLootTable(json);
    return rollLootTable(value, contextFor()).map((stack: ItemStack) => stack.id);
};

const bread = { type: 'minecraft:item', name: 'minecraft:bread' };

describe('a key nothing reads', () => {
    it('reports a pool key the grammar has no case for', () => {
        const { diagnostics } = parseLootTable({
            type: 'minecraft:chest',
            pools: [{ rolls: 1, entries: [bread], conditions: [{ condition: 'random_chance', chance: 0.2 }] }]
        });

        expect(diagnostics).toEqual([
            {
                severity: 'error',
                path: 'pools[0].conditions',
                message: 'the java loot pool grammar has no conditions member, so nothing reads it'
            }
        ]);
    });

    it('reports a table key and an entry key the same way', () => {
        const { diagnostics } = parseLootTable({
            type: 'minecraft:chest',
            tiers: {},
            pools: [{ rolls: 1, entries: [{ ...bread, functions: [] }] }]
        });

        expect(diagnostics.map((entry) => entry.path)).toEqual(['tiers', 'pools[0].entries[0].functions']);
        expect(diagnostics.every((entry) => entry.severity === 'error')).toBe(true);
    });

    it('still rolls what it could read, so one stray key does not empty a table', () => {
        expect(rollIds({ type: 'minecraft:chest', pools: [{ rolls: 1, entries: [bread], tiers: {} }] })).toEqual([
            'minecraft:bread'
        ]);
    });

    it('says nothing about the keys the grammar does read', () => {
        const { diagnostics } = parseLootTable({
            type: 'minecraft:chest',
            random_sequence: 'minecraft:chests/igloo',
            pools: [
                {
                    rolls: 1,
                    bonus_rolls: 0,
                    condition: { type: 'minecraft:random_chance', chance: 1 },
                    entries: [{ ...bread, weight: 2, quality: 1 }]
                }
            ]
        });

        expect(diagnostics).toEqual([]);
    });
});

describe('a condition nothing implements', () => {
    const unimplemented = {
        type: 'minecraft:chest',
        pools: [{ rolls: 1, entries: [bread], condition: { type: 'minecraft:has_mark_variant', value: 1 } }]
    };

    it('reports the condition type rather than skipping it', () => {
        expect(parseLootTable(unimplemented).diagnostics).toEqual([
            {
                severity: 'error',
                path: 'pools[0].condition',
                message: 'unknown loot condition type minecraft:has_mark_variant'
            }
        ]);
    });

    it('closes the gate instead of passing it', () => {
        expect(rollIds(unimplemented)).toEqual([]);
    });

    it('closes a gate whose other terms would have passed on their own', () => {
        expect(
            rollIds({
                type: 'minecraft:chest',
                pools: [
                    {
                        rolls: 1,
                        entries: [bread],
                        condition: [
                            { type: 'minecraft:random_chance', chance: 1 },
                            { type: 'minecraft:has_mark_variant', value: 1 }
                        ]
                    }
                ]
            })
        ).toEqual([]);
    });

    it('closes an entry gate as well as a pool gate', () => {
        expect(
            rollIds({
                type: 'minecraft:chest',
                pools: [
                    {
                        rolls: 1,
                        entries: [{ ...bread, condition: { type: 'minecraft:has_mark_variant', value: 1 } }]
                    }
                ]
            })
        ).toEqual([]);
    });

    it('leaves a sibling pool that parsed cleanly alone', () => {
        expect(
            rollIds({
                type: 'minecraft:chest',
                pools: [
                    { rolls: 1, entries: [bread], condition: { type: 'minecraft:has_mark_variant', value: 1 } },
                    { rolls: 1, entries: [{ type: 'minecraft:item', name: 'minecraft:apple' }] }
                ]
            })
        ).toEqual(['minecraft:apple']);
    });
});

describe('strict parsing', () => {
    it('throws with every error the table reported', () => {
        let thrown: unknown;
        try {
            parseLootTable({ type: 'minecraft:chest', pools: [{ rolls: 1, entries: [bread], conditions: [] }] }, {
                strict: true
            });
        } catch (error) {
            thrown = error;
        }

        expect(thrown).toBeInstanceOf(LootGrammarError);
        expect(thrown instanceof LootGrammarError ? thrown.diagnostics.map((entry) => entry.path) : []).toEqual([
            'pools[0].conditions'
        ]);
    });

    it('returns a table that reported only warnings', () => {
        expect(() =>
            parseLootTable({ type: 'minecraft:chest', pools: [{ rolls: 1, entries: [bread] }] }, { strict: true })
        ).not.toThrow();
    });
});
