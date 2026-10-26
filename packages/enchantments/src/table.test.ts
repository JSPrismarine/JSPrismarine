import { describe, expect, it } from 'vitest';
import type { ItemStack } from '@jsprismarine/predicates';

import { vanillaRegistry } from '../test/fixtures';
import { javaRandom } from './random';
import {
    ENCHANTING_SLOTS,
    MAX_BOOKSHELF_POWER,
    availableEnchantments,
    enchantingOffers,
    enchantmentCost,
    selectEnchantments
} from './table';

/** Item tags the fixture enchantments name, for the three items the oracle covers. */
const ITEM_TAGS: Readonly<Record<string, readonly string[]>> = {
    'minecraft:diamond_sword': [
        'minecraft:enchantable/sharp_weapon',
        'minecraft:enchantable/melee_weapon',
        'minecraft:enchantable/weapon',
        'minecraft:enchantable/durability',
        'minecraft:enchantable/fire_aspect'
    ],
    'minecraft:diamond_pickaxe': [
        'minecraft:enchantable/mining',
        'minecraft:enchantable/mining_loot',
        'minecraft:enchantable/durability'
    ],
    'minecraft:diamond_chestplate': [
        'minecraft:enchantable/armor',
        'minecraft:enchantable/chest_armor',
        'minecraft:enchantable/durability'
    ],
    'minecraft:book': []
};

/** Diamond's enchantability in vanilla, which every oracle row used. */
const DIAMOND_ENCHANTABILITY = 10;

const stack = (id: string, count = 1): ItemStack => ({
    id,
    count,
    components: new Map([['minecraft:enchantable', { value: DIAMOND_ENCHANTABILITY }]])
});

const registry = () => vanillaRegistry(ITEM_TAGS);

/**
 * Every expected row below came out of a Java program that drives the real
 * `java.util.Random` through `EnchantmentHelper.getEnchantmentCost`,
 * `selectEnchantment` and `getAvailableEnchantmentResults` over the same
 * twelve enchantment files, so the numbers are not this implementation's own
 * output.
 */
const ORACLE_COSTS = [
    'seed=0 power=0 -> 2,2,6',
    'seed=0 power=5 -> 4,7,13',
    'seed=0 power=15 -> 8,13,30',
    'seed=0 power=30 -> 8,13,30',
    'seed=1 power=0 -> 2,3,0',
    'seed=1 power=5 -> 4,7,10',
    'seed=1 power=15 -> 4,12,30',
    'seed=7 power=0 -> 2,5,3',
    'seed=7 power=5 -> 3,9,10',
    'seed=7 power=15 -> 7,9,30',
    'seed=1234 power=0 -> 2,6,7',
    'seed=1234 power=5 -> 4,7,12',
    'seed=1234 power=15 -> 5,13,30',
    'seed=99999 power=0 -> 1,3,3',
    'seed=99999 power=5 -> 3,8,10',
    'seed=99999 power=15 -> 7,11,30'
];

/** The three rows of each offer, as `cost:enchantment@level` or `cost:-`. */
const ORACLE_OFFERS = [
    'minecraft:diamond_sword seed=0 power=0 -> 2:minecraft:sharpness@1 | 2:minecraft:sharpness@1 | 6:minecraft:unbreaking@1',
    'minecraft:diamond_sword seed=0 power=5 -> 4:minecraft:smite@1 | 7:minecraft:unbreaking@1 | 13:minecraft:looting@1',
    'minecraft:diamond_sword seed=0 power=15 -> 8:minecraft:smite@1 | 13:minecraft:smite@2 | 30:minecraft:looting@2',
    'minecraft:diamond_sword seed=1 power=0 -> 2:minecraft:sharpness@1 | 3:minecraft:unbreaking@1 | 0:-',
    'minecraft:diamond_sword seed=1 power=5 -> 4:minecraft:unbreaking@1 | 7:minecraft:unbreaking@1 | 10:minecraft:smite@2',
    'minecraft:diamond_sword seed=1 power=15 -> 4:minecraft:unbreaking@1 | 12:minecraft:unbreaking@2 | 30:minecraft:smite@4',
    'minecraft:diamond_sword seed=7 power=0 -> 2:minecraft:unbreaking@1 | 5:minecraft:unbreaking@1 | 3:minecraft:sharpness@1',
    'minecraft:diamond_sword seed=7 power=5 -> 3:minecraft:unbreaking@1 | 9:minecraft:unbreaking@1 | 10:minecraft:sharpness@2',
    'minecraft:diamond_sword seed=7 power=15 -> 7:minecraft:unbreaking@1 | 9:minecraft:unbreaking@1 | 30:minecraft:looting@3',
    'minecraft:diamond_sword seed=1234 power=0 -> 2:minecraft:smite@1 | 6:minecraft:sharpness@1 | 7:minecraft:sharpness@1',
    'minecraft:diamond_sword seed=1234 power=5 -> 4:minecraft:smite@1 | 7:minecraft:sharpness@1 | 12:minecraft:sharpness@2',
    'minecraft:diamond_sword seed=1234 power=15 -> 5:minecraft:smite@1 | 13:minecraft:smite@2 | 30:minecraft:sharpness@3',
    'minecraft:diamond_sword seed=99999 power=0 -> 1:minecraft:sharpness@1 | 3:minecraft:sharpness@1 | 3:minecraft:smite@1',
    'minecraft:diamond_sword seed=99999 power=5 -> 3:minecraft:smite@1 | 8:minecraft:sharpness@1 | 10:minecraft:smite@2',
    'minecraft:diamond_sword seed=99999 power=15 -> 7:minecraft:unbreaking@1 | 11:minecraft:sharpness@2 | 30:minecraft:unbreaking@3',
    'minecraft:diamond_pickaxe seed=0 power=0 -> 2:minecraft:efficiency@1 | 2:minecraft:efficiency@1 | 6:minecraft:unbreaking@1',
    'minecraft:diamond_pickaxe seed=0 power=5 -> 4:minecraft:unbreaking@1 | 7:minecraft:efficiency@1 | 13:minecraft:efficiency@2',
    'minecraft:diamond_pickaxe seed=0 power=15 -> 8:minecraft:unbreaking@1 | 13:minecraft:unbreaking@2 | 30:minecraft:efficiency@4',
    'minecraft:diamond_pickaxe seed=1 power=0 -> 2:minecraft:efficiency@1 | 3:minecraft:unbreaking@1 | 0:-',
    'minecraft:diamond_pickaxe seed=1 power=5 -> 4:minecraft:efficiency@1 | 7:minecraft:unbreaking@1 | 10:minecraft:efficiency@2',
    'minecraft:diamond_pickaxe seed=1 power=15 -> 4:minecraft:efficiency@1 | 12:minecraft:unbreaking@2 | 30:minecraft:efficiency@4',
    'minecraft:diamond_pickaxe seed=7 power=0 -> 2:minecraft:efficiency@1 | 5:minecraft:efficiency@1 | 3:minecraft:efficiency@1',
    'minecraft:diamond_pickaxe seed=7 power=5 -> 3:minecraft:efficiency@1 | 9:minecraft:efficiency@2 | 10:minecraft:efficiency@2',
    'minecraft:diamond_pickaxe seed=7 power=15 -> 7:minecraft:efficiency@2 | 9:minecraft:efficiency@2 | 30:minecraft:efficiency@4',
    'minecraft:diamond_pickaxe seed=1234 power=0 -> 2:minecraft:efficiency@1 | 6:minecraft:unbreaking@1 | 7:minecraft:efficiency@1',
    'minecraft:diamond_pickaxe seed=1234 power=5 -> 4:minecraft:efficiency@1 | 7:minecraft:unbreaking@1 | 12:minecraft:unbreaking@2',
    'minecraft:diamond_pickaxe seed=1234 power=15 -> 5:minecraft:efficiency@1 | 13:minecraft:fortune@1 | 30:minecraft:unbreaking@3',
    'minecraft:diamond_pickaxe seed=99999 power=0 -> 1:minecraft:efficiency@1 | 3:minecraft:efficiency@1 | 3:minecraft:unbreaking@1',
    'minecraft:diamond_pickaxe seed=99999 power=5 -> 3:minecraft:unbreaking@1 | 8:minecraft:unbreaking@1 | 10:minecraft:unbreaking@2',
    'minecraft:diamond_pickaxe seed=99999 power=15 -> 7:minecraft:efficiency@1 | 11:minecraft:unbreaking@2 | 30:minecraft:efficiency@4',
    'minecraft:diamond_chestplate seed=0 power=0 -> 2:minecraft:protection@1 | 2:minecraft:protection@1 | 6:minecraft:unbreaking@1',
    'minecraft:diamond_chestplate seed=0 power=5 -> 4:minecraft:unbreaking@1 | 7:minecraft:protection@1 | 13:minecraft:thorns@1',
    'minecraft:diamond_chestplate seed=0 power=15 -> 8:minecraft:unbreaking@1 | 13:minecraft:unbreaking@2 | 30:minecraft:thorns@2',
    'minecraft:diamond_chestplate seed=1 power=0 -> 2:minecraft:protection@1 | 3:minecraft:unbreaking@1 | 0:-',
    'minecraft:diamond_chestplate seed=1 power=5 -> 4:minecraft:protection@1 | 7:minecraft:unbreaking@1 | 10:minecraft:protection@2',
    'minecraft:diamond_chestplate seed=1 power=15 -> 4:minecraft:protection@1 | 12:minecraft:thorns@1 | 30:minecraft:protection@4',
    'minecraft:diamond_chestplate seed=7 power=0 -> 2:minecraft:protection@1 | 5:minecraft:protection@1 | 3:minecraft:protection@1',
    'minecraft:diamond_chestplate seed=7 power=5 -> 3:minecraft:protection@1 | 9:minecraft:unbreaking@1 | 10:minecraft:protection@2',
    'minecraft:diamond_chestplate seed=7 power=15 -> 7:minecraft:unbreaking@1 | 9:minecraft:unbreaking@1 | 30:minecraft:protection@4',
    'minecraft:diamond_chestplate seed=1234 power=0 -> 2:minecraft:protection@1 | 6:minecraft:unbreaking@1 | 7:minecraft:protection@1',
    'minecraft:diamond_chestplate seed=1234 power=5 -> 4:minecraft:protection@1 | 7:minecraft:protection@1 | 12:minecraft:protection@2',
    'minecraft:diamond_chestplate seed=1234 power=15 -> 5:minecraft:unbreaking@1 | 13:minecraft:protection@2 | 30:minecraft:protection@3',
    'minecraft:diamond_chestplate seed=99999 power=0 -> 1:minecraft:protection@1 | 3:minecraft:protection@1 | 3:minecraft:unbreaking@1',
    'minecraft:diamond_chestplate seed=99999 power=5 -> 3:minecraft:unbreaking@1 | 8:minecraft:protection@1 | 10:minecraft:unbreaking@2',
    'minecraft:diamond_chestplate seed=99999 power=15 -> 7:minecraft:protection@1 | 11:minecraft:protection@2 | 30:minecraft:unbreaking@3'
];

const describeOffers = (item: string, seed: number, power: number): string => {
    const rows = enchantingOffers(registry(), stack(item), { seed, bookshelfPower: power });
    const shown = rows
        .map((row) =>
            row.clue === undefined ? `${row.cost}:-` : `${row.cost}:${row.clue.enchantment}@${row.clue.level}`
        )
        .join(' | ');
    return `${item} seed=${seed} power=${power} -> ${shown}`;
};

describe('the enchanting table cost formula', () => {
    it('clamps bookshelf power to 15', () => {
        expect(MAX_BOOKSHELF_POWER).toBe(15);
        expect(enchantmentCost(javaRandom(0), 2, 30)).toBe(enchantmentCost(javaRandom(0), 2, 15));
    });

    it('reproduces the three row costs of the Java oracle', () => {
        const measured = ORACLE_COSTS.map((row) => {
            const [seed, power] = row.replace('seed=', '').replace('power=', '').split(' ').map(Number);
            const random = javaRandom(seed ?? 0);
            const costs = Array.from({ length: ENCHANTING_SLOTS }, (_row, slot) => {
                const cost = enchantmentCost(random, slot, power ?? 0);
                return cost < slot + 1 ? 0 : cost;
            });
            return `seed=${seed} power=${power} -> ${costs.join(',')}`;
        });

        expect(measured).toEqual(ORACLE_COSTS);
    });
});

describe('the available enchantment window', () => {
    it('offers the highest level whose cost window contains the draw', () => {
        // sharpness: min 1 + 11 per level, max 21 + 11 per level.
        const found = registry();
        const sword = stack('minecraft:diamond_sword');

        expect(availableEnchantments(found, sword, 1)).toContainEqual({
            enchantment: 'minecraft:sharpness',
            level: 1
        });
        expect(availableEnchantments(found, sword, 23)).toContainEqual({
            enchantment: 'minecraft:sharpness',
            level: 3
        });
    });

    it('offers nothing outside every cost window', () => {
        expect(availableEnchantments(registry(), stack('minecraft:diamond_sword'), 0)).toEqual([]);
    });

    it('offers an item only what it is primary for', () => {
        const offered = availableEnchantments(registry(), stack('minecraft:diamond_pickaxe'), 20).map(
            (option) => option.enchantment
        );

        expect(offered).not.toContain('minecraft:sharpness');
        expect(offered.toSorted()).toEqual([
            'minecraft:efficiency',
            'minecraft:fortune',
            'minecraft:silk_touch',
            'minecraft:unbreaking'
        ]);
    });

    it('offers a book every enchantment in the pool', () => {
        const offered = availableEnchantments(registry(), stack('minecraft:book'), 20).map(
            (option) => option.enchantment
        );

        expect(offered).toContain('minecraft:sharpness');
        expect(offered).toContain('minecraft:efficiency');
    });
});

describe('three slot offer generation', () => {
    it('reproduces every row of the Java oracle', () => {
        const measured = ORACLE_OFFERS.map((row) => {
            const [item, seed, power] = row.split(' ');
            return describeOffers(
                item ?? '',
                Number((seed ?? '').replace('seed=', '')),
                Number((power ?? '').replace('power=', ''))
            );
        });

        expect(measured).toEqual(ORACLE_OFFERS);
    });

    it('shows nothing for a stack the table cannot enchant', () => {
        const bare: ItemStack = { id: 'minecraft:stick', count: 1, components: new Map() };
        expect(enchantingOffers(registry(), bare, { seed: 7, bookshelfPower: 15 })).toEqual([
            { cost: 0, clue: undefined },
            { cost: 0, clue: undefined },
            { cost: 0, clue: undefined }
        ]);
    });

    it('shows nothing for a stack of more than one', () => {
        expect(
            enchantingOffers(registry(), stack('minecraft:diamond_sword', 2), { seed: 7, bookshelfPower: 15 })
        ).toEqual([
            { cost: 0, clue: undefined },
            { cost: 0, clue: undefined },
            { cost: 0, clue: undefined }
        ]);
    });

    it('is stable while the seed is', () => {
        const first = enchantingOffers(registry(), stack('minecraft:diamond_sword'), { seed: 42, bookshelfPower: 15 });
        const second = enchantingOffers(registry(), stack('minecraft:diamond_sword'), { seed: 42, bookshelfPower: 15 });

        expect(second).toEqual(first);
    });
});

describe('exclusive set rejection during a draw', () => {
    it('never puts two conflicting enchantments in one draw', () => {
        // exclusive_set/mining holds fortune and silk touch, so no draw may
        // name both however the weights fall.
        const found = registry();
        let multiPickDraws = 0;

        for (let seed = 0; seed < 300; seed += 1) {
            const drawn = selectEnchantments(found, javaRandom(seed), stack('minecraft:diamond_pickaxe'), 30);
            if (drawn.length > 1) multiPickDraws += 1;

            for (const [index, pick] of drawn.entries()) {
                for (const other of drawn.slice(index + 1)) {
                    expect(
                        found.areCompatible(pick.enchantment, other.enchantment),
                        `${pick.enchantment} with ${other.enchantment}`
                    ).toBe(true);
                }
            }
        }

        expect(multiPickDraws).toBeGreaterThan(0);
    });
});
