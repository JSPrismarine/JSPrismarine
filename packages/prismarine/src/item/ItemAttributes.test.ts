import { describe, expect, it } from 'vitest';

import { Item } from './Item';

/**
 * The numbers an item answers about itself, against Java's published values.
 *
 * Every figure below is Java Edition's, written out rather than read back from
 * the same component table the code reads, so a table that stops answering
 * fails here instead of agreeing with itself. Armor went silent exactly that
 * way: the lookup asked for a modifier id no item has carried since Java split
 * the armor ids by slot, found nothing, and every piece was worth zero.
 */
const stack = (name: string) => new Item({ name });

describe('item attributes', () => {
    describe('armor points', () => {
        it.each([
            ['minecraft:leather_boots', 1],
            ['minecraft:iron_chestplate', 6],
            ['minecraft:diamond_helmet', 3],
            ['minecraft:diamond_chestplate', 8],
            ['minecraft:netherite_leggings', 6],
            ['minecraft:turtle_helmet', 2]
        ])('%s is worth %i', (name, points) => {
            expect(stack(name).getArmorDefensePoints()).toBe(points);
        });

        it('is zero for what nobody wears', () => {
            expect(stack('minecraft:iron_sword').getArmorDefensePoints()).toBe(0);
            expect(stack('minecraft:stone').getArmorDefensePoints()).toBe(0);
        });

        it('marks the wearable items as armor', () => {
            expect(stack('minecraft:iron_chestplate').isArmorPiece()).toBe(true);
            expect(stack('minecraft:iron_sword').isArmorPiece()).toBe(false);
        });
    });

    describe('armor toughness', () => {
        it.each([
            ['minecraft:diamond_helmet', 2],
            ['minecraft:diamond_chestplate', 2],
            ['minecraft:netherite_chestplate', 3]
        ])('%s is worth %i', (name, toughness) => {
            expect(stack(name).getArmorToughness()).toBe(toughness);
        });

        it('is zero below diamond, which is where Java starts giving any', () => {
            expect(stack('minecraft:iron_chestplate').getArmorToughness()).toBe(0);
            expect(stack('minecraft:leather_boots').getArmorToughness()).toBe(0);
        });
    });

    describe('attack damage', () => {
        it.each([
            ['minecraft:iron_sword', 6],
            ['minecraft:diamond_sword', 7],
            ['minecraft:golden_sword', 4],
            ['minecraft:wooden_sword', 4]
        ])('%s hits for %i', (name, damage) => {
            expect(stack(name).getAttackDamage()).toBe(damage);
        });

        it('is the bare fist for anything with no modifier', () => {
            expect(stack('minecraft:torch').getAttackDamage()).toBe(1);
        });
    });

    describe('durability', () => {
        it.each([
            ['minecraft:iron_pickaxe', 250],
            ['minecraft:diamond_chestplate', 528],
            ['minecraft:netherite_leggings', 555]
        ])('%s lasts %i uses', (name, uses) => {
            expect(stack(name).getMaxDurability()).toBe(uses);
        });

        it('is zero for what never wears out', () => {
            expect(stack('minecraft:stone').getMaxDurability()).toBe(0);
        });
    });
});
