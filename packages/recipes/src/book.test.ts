import { describe, expect, it } from 'vitest';

import { createRecipeBook, loadRecipes } from './book';
import { FIRST_RECIPE_NET_ID, compareRecipeIds, orderRecipes } from './order';
import { parseRecipe } from './parse';
import type { Recipe } from './types';

const shaped = (id: string, result: string): Recipe => {
    const { recipe } = parseRecipe(id, {
        type: 'minecraft:crafting_shaped',
        key: { '#': 'minecraft:stone' },
        pattern: ['##'],
        result: { id: result }
    });
    return recipe!;
};

describe('recipe ordering', () => {
    it('orders by namespace, then by path', () => {
        expect(compareRecipeIds('minecraft:a', 'minecraft:b')).toBeLessThan(0);
        expect(compareRecipeIds('zz:a', 'minecraft:z')).toBeGreaterThan(0);
        expect(compareRecipeIds('minecraft:a', 'a')).toBe(0);
    });

    it('compares code units rather than collating', () => {
        expect(compareRecipeIds('minecraft:Z_item', 'minecraft:a_item')).toBeLessThan(0);
    });

    it('is stable whatever order the recipes arrive in', () => {
        const ids = ['minecraft:torch', 'minecraft:anvil', 'plugin:widget', 'minecraft:bed'];
        const forward = orderRecipes(ids.map((id) => shaped(id, 'minecraft:stone'))).map((recipe) => recipe.id);
        const backward = orderRecipes([...ids].reverse().map((id) => shaped(id, 'minecraft:stone'))).map(
            (recipe) => recipe.id
        );

        expect(forward).toEqual(['minecraft:anvil', 'minecraft:bed', 'minecraft:torch', 'plugin:widget']);
        expect(backward).toEqual(forward);
    });
});

describe('createRecipeBook', () => {
    const book = createRecipeBook([
        shaped('minecraft:torch', 'minecraft:torch'),
        shaped('minecraft:anvil', 'minecraft:anvil')
    ]);

    it('numbers recipes from one in registry order', () => {
        expect(book.recipes.map((recipe) => recipe.id)).toEqual(['minecraft:anvil', 'minecraft:torch']);
        expect([...book.netIds]).toEqual([
            ['minecraft:anvil', FIRST_RECIPE_NET_ID],
            ['minecraft:torch', FIRST_RECIPE_NET_ID + 1]
        ]);
    });

    it('indexes by identifier and by station', () => {
        expect(book.get('minecraft:torch')?.id).toBe('minecraft:torch');
        expect(book.get('minecraft:nothing')).toBeUndefined();
        expect(book.byStation('crafting')).toHaveLength(2);
        expect(book.byStation('brewing')).toEqual([]);
    });

    it('lets a later recipe of the same identifier win', () => {
        const overridden = createRecipeBook([
            shaped('minecraft:torch', 'minecraft:torch'),
            shaped('minecraft:torch', 'minecraft:soul_torch')
        ]);

        expect(overridden.recipes).toHaveLength(1);
        expect(overridden.recipes[0]).toMatchObject({ result: { id: 'minecraft:soul_torch' } });
    });

    it('returns the first match in registry order and every match on request', () => {
        const grid = {
            station: 'crafting',
            grid: {
                width: 2,
                height: 1,
                slots: [
                    { id: 'minecraft:stone', count: 1 },
                    { id: 'minecraft:stone', count: 1 }
                ]
            }
        } as const;

        expect(book.match(grid)?.recipe.id).toBe('minecraft:anvil');
        expect(book.matchAll(grid).map((match) => match.recipe.id)).toEqual(['minecraft:anvil', 'minecraft:torch']);
    });
});

describe('loadRecipes', () => {
    it('keeps the readable files and names the broken ones', () => {
        const { book, failed, diagnostics } = loadRecipes([
            [
                'minecraft:torch',
                {
                    type: 'minecraft:crafting_shapeless',
                    ingredients: ['minecraft:coal'],
                    result: { id: 'minecraft:torch' }
                }
            ],
            ['minecraft:broken', { type: 'minecraft:not_a_recipe' }],
            ['minecraft:also_broken', { type: 'minecraft:crafting_shaped', pattern: ['##'], result: {} }]
        ]);

        expect(book.recipes.map((recipe) => recipe.id)).toEqual(['minecraft:torch']);
        expect(failed).toEqual(['minecraft:broken', 'minecraft:also_broken']);
        expect(diagnostics.every((diagnostic) => diagnostic.severity === 'error')).toBe(true);
    });

    it('resolves tags through the context it is given', () => {
        const { book, diagnostics } = loadRecipes(
            [
                [
                    'minecraft:slab',
                    {
                        type: 'minecraft:stonecutting',
                        ingredient: '#minecraft:stone_crafting_materials',
                        result: { id: 'minecraft:stone_slab' }
                    }
                ]
            ],
            {
                tags: (registry, tag) =>
                    registry === 'item' && tag === 'minecraft:stone_crafting_materials'
                        ? ['minecraft:stone']
                        : undefined
            }
        );

        expect(diagnostics).toEqual([]);
        expect(book.match({ station: 'stonecutting', item: { id: 'minecraft:stone', count: 1 } })?.result.id).toBe(
            'minecraft:stone_slab'
        );
    });
});
