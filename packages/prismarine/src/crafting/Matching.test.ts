import { describe, expect, it } from 'vitest';

import { Item } from '../item/Item';
import CraftingGrid from './CraftingGrid';
import { FurnaceRecipe, ShapedRecipe, ShapelessRecipe, SmithingRecipe } from './Recipe';
import { ItemIngredient } from './RecipeIngredient';

const item = (name: string, meta = 0) => new Item({ id: 1, name, meta });
const need = (name: string, meta?: number) => new ItemIngredient(name, meta);

const plank = () => item('minecraft:oak_planks');
const stick = () => item('minecraft:stick');

/** A grid from rows of names, where `.` is an empty slot. */
const grid = (...rows: string[][]) =>
    new CraftingGrid(
        rows[0]!.length,
        rows.length,
        rows.flat().map((name) => (name === '.' ? null : item(name)))
    );

const P = 'minecraft:oak_planks';
const S = 'minecraft:stick';

describe('crafting', () => {
    describe('CraftingGrid', () => {
        it('finds the rectangle the items actually occupy', () => {
            // What lets a two by two recipe match in any corner of a three by three table.
            const bounds = grid(['.', '.', '.'], ['.', P, P], ['.', P, P]).bounds();

            expect(bounds).toEqual({ x: 1, y: 1, width: 2, height: 2 });
        });

        it('has no bounds when it is empty', () => {
            expect(grid(['.', '.'], ['.', '.']).bounds()).toBeNull();
        });

        it('refuses a slot count that is not the rectangle it claims', () => {
            expect(() => new CraftingGrid(2, 2, [null, null, null])).toThrow(/needs 4 slots/);
        });
    });

    describe('ShapelessRecipe.matches', () => {
        const recipe = new ShapelessRecipe('x', 'crafting_table', [need(P), need(S)], [item('minecraft:torch')]);

        it('takes its ingredients in any arrangement', () => {
            expect(recipe.matches(grid([P, S]))).toBe(true);
            expect(recipe.matches(grid([S, P]))).toBe(true);
            expect(recipe.matches(grid([S, '.'], ['.', P]))).toBe(true);
        });

        it('refuses a grid holding anything extra', () => {
            // Otherwise a bigger arrangement would quietly make the smaller recipe.
            expect(recipe.matches(grid([P, S, P]))).toBe(false);
        });

        it('refuses a grid missing something', () => {
            expect(recipe.matches(grid([P, P]))).toBe(false);
        });

        it('does not let one item satisfy two ingredients', () => {
            const two = new ShapelessRecipe('y', 'crafting_table', [need(P), need(P)], [item('minecraft:x')]);

            expect(two.matches(grid([P, S]))).toBe(false);
            expect(two.matches(grid([P, P]))).toBe(true);
        });
    });

    describe('ShapedRecipe.matches', () => {
        // Sticks: one plank above another.
        const sticks = new ShapedRecipe('sticks', 'crafting_table', 1, 2, [need(P), need(P)], [stick()]);

        it('matches wherever in the grid it sits', () => {
            expect(sticks.matches(grid([P, '.', '.'], [P, '.', '.'], ['.', '.', '.']))).toBe(true);
            expect(sticks.matches(grid(['.', '.', P], ['.', '.', P], ['.', '.', '.']))).toBe(true);
            expect(sticks.matches(grid(['.', '.', '.'], ['.', P, '.'], ['.', P, '.']))).toBe(true);
        });

        it('refuses the same items in the wrong arrangement', () => {
            // Side by side is not one above the other, and that is the whole point of shaped.
            expect(sticks.matches(grid([P, P], ['.', '.']))).toBe(false);
        });

        it('honours the holes in a pattern', () => {
            // A hoe: two along the top, then one down the left of the row below.
            const hoe = new ShapedRecipe(
                'hoe',
                'crafting_table',
                2,
                2,
                [need(P), need(P), need(S), null],
                [item('minecraft:wooden_hoe')]
            );

            expect(hoe.matches(grid([P, P], [S, '.']))).toBe(true);
            // A slot the pattern wants empty is not a slot that may hold anything.
            expect(hoe.matches(grid([P, P], [S, S]))).toBe(false);
        });

        it('matches mirrored only when it is allowed to', () => {
            const asymmetric = new ShapedRecipe(
                'a',
                'crafting_table',
                2,
                1,
                [need(P), need(S)],
                [item('minecraft:x')],
                0,
                false
            );
            const symmetric = new ShapedRecipe(
                'b',
                'crafting_table',
                2,
                1,
                [need(P), need(S)],
                [item('minecraft:x')],
                0,
                true
            );

            expect(asymmetric.matches(grid([S, P]))).toBe(false);
            expect(symmetric.matches(grid([S, P]))).toBe(true);
        });

        it('refuses an empty grid', () => {
            expect(sticks.matches(grid(['.', '.'], ['.', '.']))).toBe(false);
        });

        it('respects a pinned meta', () => {
            const oakOnly = new ShapedRecipe('o', 'crafting_table', 1, 1, [need(P, 0)], [item('minecraft:x')]);

            expect(oakOnly.matches(new CraftingGrid(1, 1, [item(P, 0)]))).toBe(true);
            expect(oakOnly.matches(new CraftingGrid(1, 1, [item(P, 5)]))).toBe(false);
        });
    });

    describe('FurnaceRecipe.matches', () => {
        const smelt = new FurnaceRecipe('s', 'furnace', need('minecraft:iron_ore'), item('minecraft:iron_ingot'));

        it('takes exactly one thing, and the right one', () => {
            expect(smelt.matches(new CraftingGrid(1, 1, [item('minecraft:iron_ore')]))).toBe(true);
            expect(smelt.matches(new CraftingGrid(1, 1, [item('minecraft:gold_ore')]))).toBe(false);
            expect(smelt.matches(grid(['minecraft:iron_ore', 'minecraft:iron_ore']))).toBe(false);
        });
    });

    describe('SmithingRecipe.matches', () => {
        const upgrade = new SmithingRecipe(
            'u',
            'smithing_table',
            need('minecraft:netherite_upgrade_smithing_template'),
            need('minecraft:diamond_axe'),
            need('minecraft:netherite_ingot'),
            item('minecraft:netherite_axe')
        );

        it('wants its three slots in order', () => {
            const ok = grid([
                'minecraft:netherite_upgrade_smithing_template',
                'minecraft:diamond_axe',
                'minecraft:netherite_ingot'
            ]);
            const swapped = grid([
                'minecraft:diamond_axe',
                'minecraft:netherite_upgrade_smithing_template',
                'minecraft:netherite_ingot'
            ]);

            expect(upgrade.matches(ok)).toBe(true);
            // Not a bag: the template and the thing being upgraded are different slots.
            expect(upgrade.matches(swapped)).toBe(false);
        });
    });
});
