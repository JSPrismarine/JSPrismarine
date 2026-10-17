import { describe, expect, it } from 'vitest';

import { Item } from '../item/Item';
import { ANY_META, ItemIngredient, TagIngredient } from './RecipeIngredient';

const item = (name: string, meta = 0) => new Item({ id: 1, name, meta });

describe('crafting', () => {
    describe('ItemIngredient', () => {
        it('takes the item it names', () => {
            expect(new ItemIngredient('minecraft:stick').matches(item('minecraft:stick'))).toBe(true);
            expect(new ItemIngredient('minecraft:stick').matches(item('minecraft:stone'))).toBe(false);
        });

        it('takes any meta by default, because most of vanilla does', () => {
            // A recipe for a stick does not care which of the six planks it is fed, and the
            // dump says so with a real value rather than by omission.
            const any = new ItemIngredient('minecraft:planks', ANY_META);

            expect(any.matches(item('minecraft:planks', 0))).toBe(true);
            expect(any.matches(item('minecraft:planks', 5))).toBe(true);
        });

        it('pins to one meta when it is given one', () => {
            const oak = new ItemIngredient('minecraft:planks', 0);

            expect(oak.matches(item('minecraft:planks', 0))).toBe(true);
            expect(oak.matches(item('minecraft:planks', 5))).toBe(false);
        });

        it('is not satisfied by an empty slot', () => {
            expect(new ItemIngredient('minecraft:stick').matches(null)).toBe(false);
        });
    });

    describe('TagIngredient', () => {
        it('takes anything carrying the tag', () => {
            // The reason ingredients are an interface: a plugin can answer the question its
            // own way and still be matched by every station and written into the packet.
            const planks = new TagIngredient('planks', new Set(['minecraft:oak_planks', 'minecraft:birch_planks']));

            expect(planks.matches(item('minecraft:birch_planks'))).toBe(true);
            expect(planks.matches(item('minecraft:stone'))).toBe(false);
            expect(planks.describe()).toEqual({ kind: 'tag', tag: 'planks' });
        });
    });
});
