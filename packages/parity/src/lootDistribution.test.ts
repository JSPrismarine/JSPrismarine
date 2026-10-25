import { describe, expect, it } from 'vitest';

import { declaredDistribution } from './lootDistribution.ts';

/**
 * The distribution row's whole claim rests on this prediction being right, and on it refusing
 * every table it cannot predict. Both halves are checked here against small tables rather than
 * against the vanilla corpus, so a wrong rule shows up as a wrong number and not as a row that
 * quietly tests fewer tables.
 */
const pool = (entries: unknown[], rolls: unknown = 1): unknown => ({ pools: [{ rolls, entries }] });

const item = (name: string, weight?: number): Record<string, unknown> => ({
    type: 'minecraft:item',
    name,
    ...(weight === undefined ? {} : { weight })
});

describe('declaredDistribution', () => {
    it('splits one roll between the entries in proportion to their weights', () => {
        const declared = declaredDistribution(pool([item('minecraft:coal', 3), item('minecraft:diamond', 1)]));

        expect(declared?.meanDraws).toBe(1);
        expect(declared?.drawsVariance).toBe(0);
        expect(declared?.shares.get('minecraft:coal')).toBeCloseTo(0.75, 12);
        expect(declared?.shares.get('minecraft:diamond')).toBeCloseTo(0.25, 12);
    });

    it('treats a missing weight as one', () => {
        const declared = declaredDistribution(pool([item('minecraft:coal'), item('minecraft:diamond')]));

        expect(declared?.shares.get('minecraft:coal')).toBeCloseTo(0.5, 12);
    });

    it('multiplies the shares by a constant roll count', () => {
        const declared = declaredDistribution(pool([item('minecraft:coal', 1), item('minecraft:iron_ingot', 1)], 6));

        expect(declared?.meanDraws).toBe(6);
        expect(declared?.shares.get('minecraft:coal')).toBeCloseTo(3, 12);
    });

    it('takes the mean and variance of a uniform roll range', () => {
        const rolls = { type: 'minecraft:uniform', min: 2, max: 4 };
        const declared = declaredDistribution(pool([item('minecraft:coal')], rolls));

        expect(declared?.meanDraws).toBe(3);
        // Three equally likely counts, so the variance of the discrete uniform on [2, 4].
        expect(declared?.drawsVariance).toBeCloseTo((3 * 3 - 1) / 12, 12);
    });

    it('adds up the pools and merges an item two pools both hold', () => {
        const declared = declaredDistribution({
            pools: [
                { rolls: 1, entries: [item('minecraft:coal')] },
                { rolls: 2, entries: [item('minecraft:coal', 1), item('minecraft:emerald', 3)] }
            ]
        });

        expect(declared?.pools).toBe(2);
        expect(declared?.meanDraws).toBe(3);
        expect(declared?.shares.get('minecraft:coal')).toBeCloseTo(1.5, 12);
        expect(declared?.shares.get('minecraft:emerald')).toBeCloseTo(1.5, 12);
    });

    it('keeps a table whose modifiers only change a count or a component', () => {
        const entry = {
            type: 'minecraft:item',
            name: 'minecraft:coal',
            modifier: { type: 'minecraft:set_count', count: 4 }
        };

        expect(declaredDistribution(pool([entry]))?.shares.get('minecraft:coal')).toBe(1);
    });

    it.each([
        ['a condition anywhere in it', { pools: [{ rolls: 1, condition: [], entries: [item('minecraft:coal')] }] }],
        ['an entry that is not an item', pool([{ type: 'minecraft:empty' }])],
        ['a nested table reference', pool([{ type: 'minecraft:loot_table', value: 'minecraft:chests/igloo_chest' }])],
        [
            'a modifier that replaces the item',
            pool([{ ...item('minecraft:coal'), modifier: { type: 'minecraft:furnace_smelt' } }])
        ],
        [
            'a modifier that can delete a stack',
            pool([{ ...item('minecraft:coal'), modifier: { type: 'minecraft:explosion_decay' } }])
        ],
        [
            'a modifier nobody has reviewed',
            pool([{ ...item('minecraft:coal'), modifier: { type: 'minecraft:made_up' } }])
        ],
        ['a quality that luck would scale', pool([{ ...item('minecraft:coal'), quality: 2 }])],
        ['bonus rolls', { pools: [{ rolls: 1, bonus_rolls: 1, entries: [item('minecraft:coal')] }] }],
        [
            'a roll count that is not a constant or a uniform range',
            pool([item('minecraft:coal')], { type: 'minecraft:binomial', n: 3, p: 0.5 })
        ],
        ['no pools at all', { pools: [] }],
        ['no entries in a pool', pool([])]
    ])('refuses a table with %s', (_why, json) => {
        expect(declaredDistribution(json)).toBeUndefined();
    });
});
