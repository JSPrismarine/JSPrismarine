import { spendDurability } from '@jsprismarine/item-behaviors';
import { describe, expect, it } from 'vitest';

import { testContent } from '../testing/entityServer';
import { contentStackOf } from './contentStack';
import { Item } from './Item';

/**
 * A server stack as the item behaviors read one.
 *
 * Built from the name and count alone, every tool reached a behavior as new and unenchanted, so
 * `spendDurability` worked out from zero whether it broke and never rolled Unbreaking. That is
 * every hoe, axe, shovel and pair of shears used on something, and every pickaxe that mines.
 */
describe('contentStackOf', () => {
    const pickaxe = () => new Item({ name: 'minecraft:diamond_pickaxe', count: 1, content: testContent() });

    it('carries the durability spent, so a tool one use from breaking breaks', () => {
        const worn = pickaxe();
        worn.durability = 1;

        const stack = contentStackOf(testContent(), worn)!;
        const spend = spendDurability(stack, 1, { random: () => 0.5 });

        expect(stack.get('minecraft:damage')).toBe(worn.getMaxDurability() - 1);
        expect(spend.broke).toBe(true);
    });

    it('carries the enchantments, so Unbreaking applies', () => {
        // Every roll lands under Unbreaking III's three in four, so the hit is absorbed whole.
        const tough = pickaxe().withEnchantments({ 'minecraft:unbreaking': 3 });

        const spend = spendDurability(contentStackOf(testContent(), tough)!, 1, { random: () => 0 });

        expect(spend.amount).toBe(0);
    });

    it('has no stack for an item the content has no type for', () => {
        // The fixture resolves three items, and a wooden pickaxe is not one of them.
        expect(contentStackOf(testContent(), new Item({ name: 'minecraft:wooden_pickaxe' }))).toBeUndefined();
    });
});
