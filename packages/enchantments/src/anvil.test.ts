import type { ItemStack } from '@jsprismarine/predicates';
import { describe, expect, it } from 'vitest';

import { ANVIL_COST_LIMIT, ANVIL_RENAME_COST_LIMIT, combineInAnvil, increasedRepairCost } from './anvil';
import { vanillaDefinitions } from '../test/fixtures';
import { enchantmentsOf } from './item';
import type { ItemView } from './item';
import { EnchantmentRegistry } from './registry';
import { VANILLA_ENCHANTMENT_TAGS } from '../test/fixtures';

/** Durability of the diamond tools the cases use, as vanilla gives them. */
const DIAMOND_SWORD_DURABILITY = 1561;
const IRON_PICKAXE_DURABILITY = 250;

const DURABILITY: Readonly<Record<string, number>> = {
    'minecraft:diamond_sword': DIAMOND_SWORD_DURABILITY,
    'minecraft:iron_pickaxe': IRON_PICKAXE_DURABILITY
};

const ITEM_TAGS: Readonly<Record<string, readonly string[]>> = {
    'minecraft:diamond_sword': [
        'minecraft:enchantable/sharp_weapon',
        'minecraft:enchantable/melee_weapon',
        'minecraft:enchantable/weapon',
        'minecraft:enchantable/durability'
    ],
    'minecraft:iron_pickaxe': ['minecraft:enchantable/mining', 'minecraft:enchantable/durability']
};

const items: ItemView = {
    tagsOf: (itemId) => ITEM_TAGS[itemId] ?? [],
    maxDamage: (stack) => DURABILITY[stack.id] ?? 0,
    repairsWith: (stack, material) => stack.id === 'minecraft:iron_pickaxe' && material.id === 'minecraft:iron_ingot'
};

const registry = () =>
    new EnchantmentRegistry({ definitions: vanillaDefinitions(), tags: VANILLA_ENCHANTMENT_TAGS, items });

interface StackOptions {
    readonly count?: number;
    readonly damage?: number;
    readonly repairCost?: number;
    readonly enchantments?: Readonly<Record<string, number>>;
    readonly storedEnchantments?: Readonly<Record<string, number>>;
    readonly customName?: string;
}

const stack = (id: string, options: StackOptions = {}): ItemStack => {
    const components = new Map<string, unknown>();
    if (options.damage !== undefined) components.set('minecraft:damage', options.damage);
    if (options.repairCost !== undefined) components.set('minecraft:repair_cost', options.repairCost);
    if (options.enchantments) components.set('minecraft:enchantments', { levels: options.enchantments });
    if (options.storedEnchantments) {
        components.set('minecraft:stored_enchantments', { levels: options.storedEnchantments });
    }
    if (options.customName !== undefined) components.set('minecraft:custom_name', options.customName);
    return { id, count: options.count ?? 1, components };
};

const book = (enchantments: Readonly<Record<string, number>>, options: StackOptions = {}): ItemStack =>
    stack('minecraft:enchanted_book', { ...options, storedEnchantments: enchantments });

describe('the prior work penalty', () => {
    it('doubles and adds one, which is what makes the fifth use unaffordable', () => {
        expect(increasedRepairCost(0)).toBe(1);
        expect(increasedRepairCost(1)).toBe(3);
        expect(increasedRepairCost(3)).toBe(7);
        expect(increasedRepairCost(7)).toBe(15);
        expect(increasedRepairCost(15)).toBe(31);
    });

    it('carries the larger of the two inputs before doubling', () => {
        // Base at 3 and book at 7 give 7, which becomes 15.
        const result = combineInAnvil(registry(), {
            base: stack('minecraft:diamond_sword', { repairCost: 3 }),
            addition: book({ 'minecraft:sharpness': 1 }, { repairCost: 7 })
        });

        expect(result.output?.components.get('minecraft:repair_cost')).toBe(15);
        // One level for the enchantment plus the two inputs' prior work.
        expect(result.cost).toBe(1 + 3 + 7);
    });
});

describe('repairing with a material', () => {
    it('restores a quarter of the durability per material and charges one level each', () => {
        // Iron pickaxe durability 250, so a quarter is 62 per ingot.
        const result = combineInAnvil(registry(), {
            base: stack('minecraft:iron_pickaxe', { damage: 200 }),
            addition: stack('minecraft:iron_ingot', { count: 3 })
        });

        expect(result.materialCost).toBe(3);
        expect(result.cost).toBe(3);
        expect(result.output?.components.get('minecraft:damage')).toBe(200 - 62 * 3);
    });

    it('stops at the damage the item actually has', () => {
        const result = combineInAnvil(registry(), {
            base: stack('minecraft:iron_pickaxe', { damage: 30 }),
            addition: stack('minecraft:iron_ingot', { count: 5 })
        });

        expect(result.materialCost).toBe(1);
        expect(result.cost).toBe(1);
        expect(result.output?.components.get('minecraft:damage')).toBe(0);
    });

    it('rejects a repair with nothing to repair', () => {
        const result = combineInAnvil(registry(), {
            base: stack('minecraft:iron_pickaxe', { damage: 0 }),
            addition: stack('minecraft:iron_ingot', { count: 1 })
        });

        expect(result.output).toBeUndefined();
        expect(result.cost).toBe(0);
    });
});

describe('combining two of the same item', () => {
    it('adds the sacrifice durability plus twelve percent and charges two levels', () => {
        const result = combineInAnvil(registry(), {
            base: stack('minecraft:diamond_sword', { damage: 100 }),
            addition: stack('minecraft:diamond_sword', { damage: 0 })
        });

        // A full sacrifice carries far more than 100 damage, so the result is pristine.
        expect(result.output?.components.get('minecraft:damage')).toBe(0);
        expect(result.cost).toBe(2);
    });

    it('rejects two different items with no enchantments to transfer', () => {
        const result = combineInAnvil(registry(), {
            base: stack('minecraft:diamond_sword'),
            addition: stack('minecraft:iron_ingot')
        });

        expect(result.output).toBeUndefined();
    });
});

describe('merging enchantments', () => {
    it('charges the anvil cost per level, halved when the source is a book', () => {
        // sharpness has anvil_cost 1, halved to a floor of 1 for a book.
        const result = combineInAnvil(registry(), {
            base: stack('minecraft:diamond_sword'),
            addition: book({ 'minecraft:sharpness': 3 })
        });

        expect(enchantmentsOf(result.output ?? stack('minecraft:air')).get('minecraft:sharpness')).toBe(3);
        expect(result.cost).toBe(3);
    });

    it('raises two equal levels by one', () => {
        const result = combineInAnvil(registry(), {
            base: stack('minecraft:diamond_sword', { enchantments: { 'minecraft:sharpness': 3 } }),
            addition: stack('minecraft:diamond_sword', { enchantments: { 'minecraft:sharpness': 3 } })
        });

        expect(enchantmentsOf(result.output ?? stack('minecraft:air')).get('minecraft:sharpness')).toBe(4);
        // Four levels at anvil cost one, with no repair because neither is damaged.
        expect(result.cost).toBe(4);
    });

    it('takes the larger of two unequal levels', () => {
        const result = combineInAnvil(registry(), {
            base: stack('minecraft:diamond_sword', { enchantments: { 'minecraft:sharpness': 4 } }),
            addition: book({ 'minecraft:sharpness': 2 })
        });

        expect(enchantmentsOf(result.output ?? stack('minecraft:air')).get('minecraft:sharpness')).toBe(4);
    });

    it('caps a merge at the enchantment max level', () => {
        // sharpness tops out at 5, so 5 and 5 stay 5 rather than becoming 6.
        const result = combineInAnvil(registry(), {
            base: stack('minecraft:diamond_sword', { enchantments: { 'minecraft:sharpness': 5 } }),
            addition: book({ 'minecraft:sharpness': 5 })
        });

        expect(enchantmentsOf(result.output ?? stack('minecraft:air')).get('minecraft:sharpness')).toBe(5);
        expect(result.cost).toBe(5);
    });

    it('rejects a book whose only enchantment conflicts with one already on the item', () => {
        // sharpness and smite share exclusive_set/damage.
        const result = combineInAnvil(registry(), {
            base: stack('minecraft:diamond_sword', { enchantments: { 'minecraft:sharpness': 1 } }),
            addition: book({ 'minecraft:smite': 2 })
        });

        expect(result.output).toBeUndefined();
    });

    it('keeps the compatible half of a book and charges a level for the conflict', () => {
        const result = combineInAnvil(registry(), {
            base: stack('minecraft:diamond_sword', { enchantments: { 'minecraft:sharpness': 1 } }),
            addition: book({ 'minecraft:smite': 2, 'minecraft:unbreaking': 1 })
        });

        const merged = enchantmentsOf(result.output ?? stack('minecraft:air'));
        expect(merged.get('minecraft:smite')).toBeUndefined();
        expect(merged.get('minecraft:unbreaking')).toBe(1);
        // One level for the rejected smite plus unbreaking at anvil cost 2, halved to 1.
        expect(result.cost).toBe(1 + 1);
    });

    it('rejects an enchantment the item does not support', () => {
        const result = combineInAnvil(registry(), {
            base: stack('minecraft:diamond_sword'),
            addition: book({ 'minecraft:efficiency': 1 })
        });

        expect(result.output).toBeUndefined();
    });

    it('lets a creative player apply an unsupported enchantment', () => {
        const result = combineInAnvil(
            registry(),
            { base: stack('minecraft:diamond_sword'), addition: book({ 'minecraft:efficiency': 1 }) },
            { unlimitedMaterials: true }
        );

        expect(enchantmentsOf(result.output ?? stack('minecraft:air')).get('minecraft:efficiency')).toBe(1);
    });
});

describe('the level ceiling', () => {
    it('refuses a combination that reaches forty levels', () => {
        const result = combineInAnvil(registry(), {
            base: stack('minecraft:diamond_sword', { repairCost: ANVIL_COST_LIMIT - 1 }),
            addition: book({ 'minecraft:sharpness': 1 })
        });

        expect(result.cost).toBe(ANVIL_COST_LIMIT);
        expect(result.output).toBeUndefined();
    });

    it('lets a creative player past the ceiling', () => {
        const result = combineInAnvil(
            registry(),
            {
                base: stack('minecraft:diamond_sword', { repairCost: ANVIL_COST_LIMIT - 1 }),
                addition: book({ 'minecraft:sharpness': 1 })
            },
            { unlimitedMaterials: true }
        );

        expect(result.output).toBeDefined();
    });
});

describe('renaming', () => {
    it('charges one level and leaves the prior work penalty alone', () => {
        const result = combineInAnvil(registry(), {
            base: stack('minecraft:diamond_sword', { repairCost: 3 }),
            name: 'Excalibur'
        });

        expect(result.cost).toBe(1 + 3);
        expect(result.onlyRenaming).toBe(true);
        expect(result.output?.components.get('minecraft:custom_name')).toBe('Excalibur');
        expect(result.output?.components.get('minecraft:repair_cost')).toBe(3);
    });

    it('caps a pure rename one level below the ceiling', () => {
        const result = combineInAnvil(registry(), {
            base: stack('minecraft:diamond_sword', { repairCost: 50 }),
            name: 'Excalibur'
        });

        expect(result.cost).toBe(ANVIL_RENAME_COST_LIMIT);
        expect(result.output).toBeDefined();
    });

    it('charges a level to clear a custom name', () => {
        const result = combineInAnvil(registry(), {
            base: stack('minecraft:diamond_sword', { customName: 'Excalibur' }),
            name: ''
        });

        expect(result.cost).toBe(1);
        expect(result.output?.components.has('minecraft:custom_name')).toBe(false);
    });

    it('charges nothing when the typed name is the one already set', () => {
        const result = combineInAnvil(registry(), {
            base: stack('minecraft:diamond_sword', { customName: 'Excalibur' }),
            name: 'Excalibur'
        });

        expect(result.cost).toBe(0);
        expect(result.output).toBeUndefined();
    });

    it('does nothing with an empty left slot name and no addition', () => {
        const result = combineInAnvil(registry(), { base: stack('minecraft:diamond_sword') });

        expect(result.cost).toBe(0);
        expect(result.output).toBeUndefined();
    });
});

describe('the left slot', () => {
    it('refuses an enchanted book with no stored enchantments', () => {
        const result = combineInAnvil(registry(), {
            base: { id: 'minecraft:enchanted_book', count: 1, components: new Map() },
            addition: book({ 'minecraft:sharpness': 1 })
        });

        expect(result.output).toBeUndefined();
    });

    it('writes a merged book back to its stored enchantments', () => {
        const result = combineInAnvil(registry(), {
            base: book({ 'minecraft:sharpness': 1 }),
            addition: book({ 'minecraft:sharpness': 1 })
        });

        expect(result.output?.components.get('minecraft:stored_enchantments')).toEqual({
            levels: { 'minecraft:sharpness': 2 }
        });
    });
});
