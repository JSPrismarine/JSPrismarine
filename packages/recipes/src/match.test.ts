import { describe, expect, it } from 'vitest';

import type { RecipeContext } from './context';
import type { CraftingGrid } from './grid';
import { cropGrid } from './grid';
import type { RecipeItemStack } from './itemStack';
import { matchRecipe } from './match';
import { parseRecipe } from './parse';
import type { Recipe } from './types';

const item = (id: string, components?: Record<string, unknown>): RecipeItemStack => ({
    id,
    count: 1,
    ...(components !== undefined ? { components } : {})
});

/** Builds a grid from rows of identifiers, where `.` is an empty slot. */
const grid = (...rows: readonly string[]): CraftingGrid => {
    const cells = rows.map((row) => row.split(' ').filter((cell) => cell.length > 0));
    const width = cells[0]?.length ?? 0;
    return {
        width,
        height: cells.length,
        slots: cells.flat().map((cell) => (cell === '.' ? null : item(`minecraft:${cell}`)))
    };
};

const recipeOf = (source: Record<string, unknown>): Recipe => {
    const { recipe, diagnostics } = parseRecipe('test:recipe', source);
    expect(diagnostics.filter((diagnostic) => diagnostic.severity === 'error')).toEqual([]);
    return recipe!;
};

const craft = (recipe: Recipe, table: CraftingGrid, context?: RecipeContext) =>
    matchRecipe(recipe, { station: 'crafting', grid: table }, context);

describe('cropGrid', () => {
    it('shrinks to the bounding box and records where each slot came from', () => {
        const cropped = cropGrid(grid('. . .', '. a b', '. . .'));

        expect(cropped).toMatchObject({ width: 2, height: 1, filled: 2, sourceSlots: [4, 5] });
    });

    it('reports an empty grid', () => {
        expect(cropGrid(grid('. .', '. .'))).toMatchObject({ width: 0, height: 0, filled: 0 });
    });
});

describe('shaped matching', () => {
    const slab = recipeOf({
        type: 'minecraft:crafting_shaped',
        key: { '#': 'minecraft:stone' },
        pattern: ['###'],
        result: { count: 6, id: 'minecraft:stone_slab' }
    });

    const torch = recipeOf({
        type: 'minecraft:crafting_shaped',
        key: { C: 'minecraft:coal', S: 'minecraft:stick' },
        pattern: ['C', 'S'],
        result: { count: 4, id: 'minecraft:torch' }
    });

    const hopper = recipeOf({
        type: 'minecraft:crafting_shaped',
        key: { C: 'minecraft:chest', I: 'minecraft:iron_ingot' },
        pattern: ['I I', 'ICI', ' I '],
        result: { id: 'minecraft:hopper' }
    });

    it('matches at every offset a 3x3 table allows', () => {
        for (const table of [
            grid('stone stone stone', '. . .', '. . .'),
            grid('. . .', 'stone stone stone', '. . .'),
            grid('. . .', '. . .', 'stone stone stone')
        ])
            expect(craft(slab, table)?.result).toEqual({ id: 'minecraft:stone_slab', count: 6 });
    });

    it('matches a 2x2 recipe in each corner of a 3x3 table', () => {
        const planks = recipeOf({
            type: 'minecraft:crafting_shaped',
            key: { '#': 'minecraft:oak_planks' },
            pattern: ['##', '##'],
            result: { id: 'minecraft:crafting_table' }
        });

        for (const table of [
            grid('oak_planks oak_planks .', 'oak_planks oak_planks .', '. . .'),
            grid('. oak_planks oak_planks', '. oak_planks oak_planks', '. . .'),
            grid('. . .', 'oak_planks oak_planks .', 'oak_planks oak_planks .'),
            grid('. . .', '. oak_planks oak_planks', '. oak_planks oak_planks')
        ])
            expect(craft(planks, table)?.result.id).toBe('minecraft:crafting_table');
    });

    it('rejects a pattern split across the grid rather than packed', () => {
        expect(craft(slab, grid('stone . stone', '. stone .', '. . .'))).toBeUndefined();
    });

    it('matches the mirrored arrangement of an asymmetric pattern', () => {
        const bow = recipeOf({
            type: 'minecraft:crafting_shaped',
            key: { S: 'minecraft:string', X: 'minecraft:stick' },
            pattern: [' XS', 'X S', ' XS'],
            result: { id: 'minecraft:bow' }
        });

        expect(craft(bow, grid('. stick string', 'stick . string', '. stick string'))?.result.id).toBe('minecraft:bow');
        expect(craft(bow, grid('string stick .', 'string . stick', 'string stick .'))?.result.id).toBe('minecraft:bow');
    });

    it('does not mirror vertically', () => {
        expect(craft(torch, grid('coal', 'stick'))?.result.count).toBe(4);
        expect(craft(torch, grid('stick', 'coal'))).toBeUndefined();
    });

    it('keeps interior gaps significant', () => {
        expect(
            craft(hopper, grid('iron_ingot . iron_ingot', 'iron_ingot chest iron_ingot', '. iron_ingot .'))
        ).toBeDefined();
        expect(
            craft(hopper, grid('iron_ingot iron_ingot iron_ingot', 'iron_ingot chest iron_ingot', '. iron_ingot .'))
        ).toBeUndefined();
    });

    it('reports a consumption of one per filled slot', () => {
        const match = craft(slab, grid('. . .', 'stone stone stone', '. . .'));

        expect(match?.consumed).toEqual([0, 0, 0, 1, 1, 1, 0, 0, 0]);
        expect(match?.remainder).toEqual([null, null, null, null, null, null, null, null, null]);
    });
});

describe('shapeless matching', () => {
    const stew = recipeOf({
        type: 'minecraft:crafting_shapeless',
        ingredients: [
            ['minecraft:brown_mushroom', 'minecraft:red_mushroom'],
            ['minecraft:brown_mushroom', 'minecraft:red_mushroom'],
            'minecraft:bowl'
        ],
        result: { id: 'minecraft:mushroom_stew' }
    });

    it('ignores the arrangement', () => {
        expect(craft(stew, grid('brown_mushroom red_mushroom bowl'))?.result.id).toBe('minecraft:mushroom_stew');
        expect(craft(stew, grid('bowl .', '. red_mushroom', 'brown_mushroom .'))?.result.id).toBe(
            'minecraft:mushroom_stew'
        );
    });

    it('needs an assignment of every ingredient to a distinct slot', () => {
        expect(craft(stew, grid('bowl bowl brown_mushroom'))).toBeUndefined();
        expect(craft(stew, grid('brown_mushroom brown_mushroom bowl'))?.result.id).toBe('minecraft:mushroom_stew');
    });

    it('rejects a grid with the wrong number of items', () => {
        expect(craft(stew, grid('brown_mushroom bowl'))).toBeUndefined();
        expect(craft(stew, grid('brown_mushroom red_mushroom bowl bowl'))).toBeUndefined();
    });
});

describe('remainder items', () => {
    const remainderOf = (id: string): string | undefined =>
        ({ 'minecraft:milk_bucket': 'minecraft:bucket', 'minecraft:honey_bottle': 'minecraft:glass_bottle' })[id];

    it('leaves the bucket behind when a cake recipe consumes milk', () => {
        const cake = recipeOf({
            type: 'minecraft:crafting_shaped',
            key: {
                A: 'minecraft:milk_bucket',
                B: 'minecraft:sugar',
                C: 'minecraft:wheat',
                E: 'minecraft:egg'
            },
            pattern: ['AAA', 'BEB', 'CCC'],
            result: { id: 'minecraft:cake' }
        });

        const match = craft(cake, grid('milk_bucket milk_bucket milk_bucket', 'sugar egg sugar', 'wheat wheat wheat'), {
            remainderOf
        });

        expect(match?.consumed).toEqual([1, 1, 1, 1, 1, 1, 1, 1, 1]);
        expect(match?.remainder.slice(0, 3)).toEqual([
            { id: 'minecraft:bucket', count: 1 },
            { id: 'minecraft:bucket', count: 1 },
            { id: 'minecraft:bucket', count: 1 }
        ]);
        expect(match?.remainder.slice(3)).toEqual([null, null, null, null, null, null]);
    });

    it('leaves nothing behind without the lookup', () => {
        const candy = recipeOf({
            type: 'minecraft:crafting_shapeless',
            ingredients: ['minecraft:honey_bottle'],
            result: { id: 'minecraft:honeycomb' }
        });

        expect(craft(candy, grid('honey_bottle'))?.remainder).toEqual([null]);
        expect(craft(candy, grid('honey_bottle'), { remainderOf })?.remainder).toEqual([
            { id: 'minecraft:glass_bottle', count: 1 }
        ]);
    });
});

describe('the single-slot and multi-slot stations', () => {
    it.each([
        ['minecraft:smelting', 'smelting'],
        ['minecraft:blasting', 'blasting'],
        ['minecraft:smoking', 'smoking'],
        ['minecraft:campfire_cooking', 'campfire_cooking']
    ] as const)('matches %s only at the %s station', (type, station) => {
        const cooking = recipeOf({
            type,
            cookingtime: 100,
            experience: 0.1,
            ingredient: 'minecraft:beef',
            result: { id: 'minecraft:cooked_beef' }
        });

        expect(matchRecipe(cooking, { station, item: item('minecraft:beef') })).toMatchObject({
            result: { id: 'minecraft:cooked_beef', count: 1 },
            experience: 0.1,
            cookingTime: 100
        });
        expect(matchRecipe(cooking, { station, item: item('minecraft:porkchop') })).toBeUndefined();
        expect(matchRecipe(cooking, { station: 'stonecutting', item: item('minecraft:beef') })).toBeUndefined();
    });

    it('matches a cooking recipe and reports its experience and time', () => {
        const smelting = recipeOf({
            type: 'minecraft:smelting',
            cookingtime: 200,
            experience: 0.35,
            ingredient: 'minecraft:potato',
            result: { id: 'minecraft:baked_potato' }
        });

        const match = matchRecipe(smelting, { station: 'smelting', item: item('minecraft:potato') });

        expect(match).toMatchObject({
            result: { id: 'minecraft:baked_potato', count: 1 },
            experience: 0.35,
            cookingTime: 200,
            consumed: [1]
        });
        expect(matchRecipe(smelting, { station: 'blasting', item: item('minecraft:potato') })).toBeUndefined();
    });

    it('matches a stonecutting recipe', () => {
        const cut = recipeOf({
            type: 'minecraft:stonecutting',
            ingredient: 'minecraft:andesite',
            result: { count: 2, id: 'minecraft:andesite_slab' }
        });

        expect(matchRecipe(cut, { station: 'stonecutting', item: item('minecraft:andesite') })?.result).toEqual({
            id: 'minecraft:andesite_slab',
            count: 2
        });
    });

    it('matches a smithing transform and carries the base components across', () => {
        const smithing = recipeOf({
            type: 'minecraft:smithing_transform',
            addition: 'minecraft:netherite_ingot',
            base: 'minecraft:diamond_axe',
            result: { id: 'minecraft:netherite_axe' },
            template: 'minecraft:netherite_upgrade_smithing_template'
        });

        const match = matchRecipe(smithing, {
            station: 'smithing',
            template: item('minecraft:netherite_upgrade_smithing_template'),
            base: item('minecraft:diamond_axe', { 'minecraft:damage': 40 }),
            addition: item('minecraft:netherite_ingot')
        });

        expect(match?.result).toEqual({
            id: 'minecraft:netherite_axe',
            count: 1,
            components: { 'minecraft:damage': 40 }
        });
        expect(match?.consumed).toEqual([1, 1, 1]);
    });

    it('requires an empty slot where a smithing recipe declares no ingredient', () => {
        const smithing = recipeOf({
            type: 'minecraft:smithing_transform',
            base: 'minecraft:diamond_axe',
            result: { id: 'minecraft:netherite_axe' }
        });

        expect(
            matchRecipe(smithing, {
                station: 'smithing',
                template: null,
                base: item('minecraft:diamond_axe'),
                addition: null
            })
        ).toBeDefined();
        expect(
            matchRecipe(smithing, {
                station: 'smithing',
                template: item('minecraft:netherite_upgrade_smithing_template'),
                base: item('minecraft:diamond_axe'),
                addition: null
            })
        ).toBeUndefined();
    });

    it('writes the trim pattern and material on a smithing trim', () => {
        const trim = recipeOf({
            type: 'minecraft:smithing_trim',
            addition: 'minecraft:emerald',
            base: 'minecraft:iron_chestplate',
            pattern: 'minecraft:bolt',
            template: 'minecraft:bolt_armor_trim_smithing_template'
        });

        const match = matchRecipe(trim, {
            station: 'smithing',
            template: item('minecraft:bolt_armor_trim_smithing_template'),
            base: item('minecraft:iron_chestplate'),
            addition: item('minecraft:emerald', { 'minecraft:provides_trim_material': 'minecraft:emerald' })
        });

        expect(match?.result).toEqual({
            id: 'minecraft:iron_chestplate',
            count: 1,
            components: { 'minecraft:trim': { pattern: 'minecraft:bolt', material: 'minecraft:emerald' } }
        });
    });

    it('matches a brewing recipe through its inline potion predicate', () => {
        const brewing = recipeOf({
            type: 'minecraft:brewing',
            input: { item: 'minecraft:potion', potion_contents: { potions: 'minecraft:awkward' } },
            output: {
                components: { 'minecraft:potion_contents': { potion: 'minecraft:strength' } },
                id: 'minecraft:potion'
            },
            reagent: { item: 'minecraft:blaze_powder' }
        });

        const awkward = item('minecraft:potion', { 'minecraft:potion_contents': { potion: 'minecraft:awkward' } });

        expect(
            matchRecipe(brewing, { station: 'brewing', input: awkward, reagent: item('minecraft:blaze_powder') })
                ?.result
        ).toEqual({
            id: 'minecraft:potion',
            count: 1,
            components: { 'minecraft:potion_contents': { potion: 'minecraft:strength' } }
        });
        expect(
            matchRecipe(brewing, {
                station: 'brewing',
                input: item('minecraft:potion', { 'minecraft:potion_contents': { potion: 'minecraft:water' } }),
                reagent: item('minecraft:blaze_powder')
            })
        ).toBeUndefined();
    });

    it('never matches a recipe at the wrong station', () => {
        const shaped = recipeOf({
            type: 'minecraft:crafting_shaped',
            key: { '#': 'minecraft:stone' },
            pattern: ['###'],
            result: { id: 'minecraft:stone_slab' }
        });

        expect(matchRecipe(shaped, { station: 'smelting', item: item('minecraft:stone') })).toBeUndefined();
    });
});
