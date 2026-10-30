import { describe, expect, it } from 'vitest';

import type { Recipe } from '../crafting/Recipe';
import { FurnaceRecipe, ShapedRecipe, ShapelessRecipe, SmithingRecipe } from '../crafting/Recipe';
import { ANY_META, ItemIngredient } from '../crafting/RecipeIngredient';
import { Item } from '../item/Item';
import { craftingDataFromRecipes } from './payloadAdapters';

const item = (name: string) => new Item({ runtimeId: 1, name });
const need = (name: string, meta?: number) => new ItemIngredient(name, meta);

describe('server recipe payload adapter', () => {
    it('maps each recipe kind to its Protocol list and keeps empty shaped slots', () => {
        const shaped = new ShapedRecipe(
            'hoe',
            'crafting_table',
            2,
            2,
            [need('minecraft:stick'), need('minecraft:stick'), need('minecraft:coal'), null],
            [item('minecraft:wooden_hoe')],
            3,
            true
        );
        const shapeless = new ShapelessRecipe(
            'torch',
            'crafting_table',
            [need('minecraft:stick'), need('minecraft:coal')],
            [item('minecraft:torch')],
            2
        );
        const smithing = new SmithingRecipe(
            'upgrade',
            'smithing_table',
            need('minecraft:template'),
            need('minecraft:diamond_axe'),
            need('minecraft:netherite_ingot'),
            item('minecraft:netherite_axe')
        );

        const data = craftingDataFromRecipes(
            [shapeless, shaped, smithing],
            (recipe) =>
                new Map<Recipe, number>([
                    [shapeless, 11],
                    [shaped, 12],
                    [smithing, 13]
                ]).get(recipe) ?? 0
        );

        expect(data.shaped).toMatchObject([
            {
                id: 'hoe',
                netId: 12,
                width: 2,
                height: 2,
                pattern: [
                    { descriptor: { kind: 'name', name: 'minecraft:stick', meta: ANY_META }, count: 1 },
                    { descriptor: { kind: 'name', name: 'minecraft:stick', meta: ANY_META }, count: 1 },
                    { descriptor: { kind: 'name', name: 'minecraft:coal', meta: ANY_META }, count: 1 },
                    { descriptor: null, count: 0 }
                ],
                priority: 3,
                symmetric: true
            }
        ]);
        expect(data.shapeless).toMatchObject([{ id: 'torch', netId: 11, priority: 2 }]);
        expect(data.smithingTransform).toMatchObject([
            {
                id: 'upgrade',
                netId: 13,
                template: { descriptor: { kind: 'name', name: 'minecraft:template', meta: ANY_META }, count: 1 },
                base: { descriptor: { kind: 'name', name: 'minecraft:diamond_axe', meta: ANY_META }, count: 1 },
                addition: { descriptor: { kind: 'name', name: 'minecraft:netherite_ingot', meta: ANY_META }, count: 1 }
            }
        ]);
        expect(data.potionMixes).toEqual([]);
        expect(data.cleanRecipes).toBe(true);
    });

    it('omits furnace recipes and rejects a recipe kind with no Protocol list', () => {
        const furnace = new FurnaceRecipe('smelt', 'furnace', need('minecraft:stone'), item('minecraft:stone'));

        expect(craftingDataFromRecipes([furnace]).shapeless).toEqual([]);

        const unknown: Recipe = {
            id: 'unknown',
            station: 'crafting_table',
            priority: 0,
            getIngredients: () => [],
            getOutputs: () => [],
            matches: () => false
        };

        expect(() => craftingDataFromRecipes([unknown])).toThrow(/cannot send/);
    });

    it('uses one-based recipe positions when the caller does not provide net ids', () => {
        const first = new ShapelessRecipe('first', 'crafting_table', [], [item('minecraft:torch')]);
        const second = new ShapelessRecipe('second', 'crafting_table', [], [item('minecraft:torch')]);

        expect(craftingDataFromRecipes([first, second]).shapeless.map((recipe) => recipe.netId)).toEqual([1, 2]);
    });
});
