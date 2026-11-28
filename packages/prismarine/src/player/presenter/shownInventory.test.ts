import { describe, expect, it } from 'vitest';

import { Item } from '../../item/Item';
import { testContent } from '../../testing/entityServer';
import { shownStackOf } from './shownInventory';

describe('shownStackOf', () => {
    it('keeps what a stack changes from its item: its name, lore, spent durability, enchantments and other components', () => {
        const pickaxe = new Item({
            name: 'minecraft:diamond_pickaxe',
            count: 1,
            content: testContent(),
            customName: 'Old Reliable',
            lore: ['Mined a lot'],
            components: { 'minecraft:item_model': 'loopback:pick' }
        }).withEnchantments({ 'minecraft:efficiency': 3 });
        pickaxe.durability = pickaxe.getMaxDurability() - 42;

        expect(shownStackOf(pickaxe)).toEqual({
            name: 'minecraft:diamond_pickaxe',
            count: 1,
            customName: 'Old Reliable',
            lore: ['Mined a lot'],
            damage: 42,
            enchantments: new Map([['minecraft:efficiency', 3]]),
            components: { 'minecraft:item_model': 'loopback:pick' }
        });
    });

    it('shows a plain stack as its name and count, and an empty slot as null', () => {
        const content = testContent();
        expect(shownStackOf(new Item({ name: 'minecraft:stone', count: 10, content }))).toEqual({
            name: 'minecraft:stone',
            count: 10
        });
        expect(shownStackOf(new Item({ name: 'minecraft:diamond_pickaxe', count: 1, content }))).toEqual({
            name: 'minecraft:diamond_pickaxe',
            count: 1
        });
        expect(shownStackOf(null)).toBeNull();
    });
});
