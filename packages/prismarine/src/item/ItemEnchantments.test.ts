import { describe, expect, it } from 'vitest';

import { Item } from './Item';

/**
 * Enchantments on a stack, which is where every enchantment mechanic starts.
 *
 * Before this the stack had nowhere to carry one: `hasEnchantment` returned a
 * literal false and `asPredicateStack` handed the loot grammar an empty
 * component map, so Fortune could not raise a drop count and Protection could
 * not reduce a blow however the item got enchanted.
 */
describe('Item enchantments', () => {
    it('carries the levels it was built with, under namespaced ids', () => {
        const stack = new Item({ name: 'minecraft:diamond_sword', enchantments: { sharpness: 3 } });

        expect(stack.getEnchantmentLevel('minecraft:sharpness')).toBe(3);
        expect(stack.getEnchantmentLevel('sharpness')).toBe(3);
        expect(stack.hasEnchantment('minecraft:sharpness')).toBe(true);
    });

    it('answers zero for an enchantment it does not carry', () => {
        const stack = new Item({ name: 'minecraft:diamond_sword', enchantments: { sharpness: 3 } });

        expect(stack.getEnchantmentLevel('minecraft:smite')).toBe(0);
        expect(stack.hasEnchantment('minecraft:smite')).toBe(false);
    });

    it('drops a level of zero rather than recording an enchantment nothing has', () => {
        const stack = new Item({ name: 'minecraft:diamond_sword', enchantments: { sharpness: 0 } });

        expect([...stack.getEnchantments()]).toEqual([]);
    });

    it('takes a map as readily as a record', () => {
        const stack = new Item({
            name: 'minecraft:diamond_sword',
            enchantments: new Map([['minecraft:sharpness', 2]])
        });

        expect(stack.getEnchantmentLevel('minecraft:sharpness')).toBe(2);
    });

    it('enchants into a copy, leaving the stack it came from alone', () => {
        const plain = new Item({ name: 'minecraft:diamond_sword' });
        const enchanted = plain.withEnchantments({ 'minecraft:sharpness': 5 });

        expect(enchanted.getEnchantmentLevel('minecraft:sharpness')).toBe(5);
        expect(plain.getEnchantmentLevel('minecraft:sharpness')).toBe(0);
        expect(enchanted.getName()).toBe(plain.getName());
        expect(enchanted.getAmount()).toBe(plain.getAmount());
    });

    describe('as the predicate grammar reads it', () => {
        it('puts the enchantments in the component map Java names', () => {
            const stack = new Item({ name: 'minecraft:diamond_pickaxe', enchantments: { fortune: 3 } });

            expect(stack.asPredicateStack().components.get('minecraft:enchantments')).toEqual({
                levels: { 'minecraft:fortune': 3 }
            });
        });

        it('leaves the component out of an unenchanted stack', () => {
            const stack = new Item({ name: 'minecraft:diamond_pickaxe' });

            expect(stack.asPredicateStack().components.has('minecraft:enchantments')).toBe(false);
        });

        it('carries the durability pair the anvil reads, off Java components', () => {
            const stack = new Item({ name: 'minecraft:diamond_pickaxe' });
            stack.durability = 1000;

            const components = stack.asPredicateStack().components;
            expect(components.get('minecraft:max_damage')).toBe(1561);
            expect(components.get('minecraft:damage')).toBe(561);
        });

        it('carries the enchantability the enchanting table draws against', () => {
            const stack = new Item({ name: 'minecraft:diamond_pickaxe' });

            expect(stack.asPredicateStack().components.get('minecraft:enchantable')).toEqual({ value: 10 });
        });
    });
});
