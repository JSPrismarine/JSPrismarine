import { FIRST_RECIPE_NET_ID, assignNetIds, orderRecipes } from '@jsprismarine/recipes';
import { describe, expect, it } from 'vitest';

import { ANY_META, RECIPES_WITHOUT_A_BEDROCK_FORM, buildCraftingData } from './craftingData';

import type { CompiledIngredient, CompiledRecipe, Recipe, RecipeType } from '@jsprismarine/recipes';

const accepts = (...items: readonly string[]): CompiledIngredient => ({
    items: items.map((identifier) => ({ identifier })),
    tags: []
});

const compiled = (recipe: Partial<CompiledRecipe> & Pick<CompiledRecipe, 'id' | 'type' | 'station'>): CompiledRecipe =>
    ({
        netId: 1,
        blockTags: [],
        ingredients: [],
        ...recipe
    }) satisfies CompiledRecipe;

const shapedRecipe = compiled({
    id: 'minecraft:oak_planks',
    type: 'minecraft:crafting_shaped',
    station: 'crafting',
    netId: 7,
    blockTags: ['crafting_table'],
    shape: { width: 2, height: 1 },
    ingredients: [accepts('minecraft:oak_log'), null],
    result: { identifier: 'minecraft:oak_planks', count: 4 }
});

describe('buildCraftingData', () => {
    it('writes a shaped recipe with every slot of the pattern, holes included', () => {
        const { shaped } = buildCraftingData([shapedRecipe]);

        expect(shaped).toHaveLength(1);
        expect(shaped[0]).toEqual({
            id: 'minecraft:oak_planks',
            netId: 7,
            station: 'crafting_table',
            width: 2,
            height: 1,
            pattern: [
                { descriptor: { kind: 'name', name: 'minecraft:oak_log', meta: ANY_META }, count: 1 },
                { descriptor: null, count: 0 }
            ],
            outputs: [{ name: 'minecraft:oak_planks', meta: 0, count: 4 }],
            priority: 0,
            symmetric: false
        });
    });

    it('writes the station as the Bedrock block tag the recipe compiled with', () => {
        const { shapeless } = buildCraftingData([
            compiled({
                id: 'a',
                type: 'minecraft:crafting_shapeless',
                station: 'crafting',
                blockTags: ['crafting_table'],
                ingredients: [accepts('minecraft:stick')],
                result: { identifier: 'minecraft:torch', count: 1 }
            })
        ]);

        expect(shapeless[0]?.station).toBe('crafting_table');
    });

    it('falls back to the station’s own tag when the recipe carries none', () => {
        const { shapeless } = buildCraftingData([
            compiled({
                id: 'a',
                type: 'minecraft:stonecutting',
                station: 'stonecutting',
                ingredients: [accepts('minecraft:stone')],
                result: { identifier: 'minecraft:stone_bricks', count: 1 }
            })
        ]);

        expect(shapeless[0]?.station).toBe('stonecutter');
    });

    it('sends a stonecutter recipe as a shapeless one, which is how the vanilla pack writes its own', () => {
        const { shapeless, shaped } = buildCraftingData([
            compiled({
                id: 'minecraft:stonecutting/stone_bricks',
                type: 'minecraft:stonecutting',
                station: 'stonecutting',
                ingredients: [accepts('minecraft:stone')],
                result: { identifier: 'minecraft:stone_bricks', count: 1 }
            })
        ]);

        expect(shaped).toEqual([]);
        expect(shapeless[0]).toMatchObject({
            station: 'stonecutter',
            ingredients: [{ descriptor: { kind: 'name', name: 'minecraft:stone', meta: ANY_META }, count: 1 }]
        });
    });

    it('drops the empty slots of a shapeless recipe, which has no grid to hold them', () => {
        const { shapeless } = buildCraftingData([
            compiled({
                id: 'a',
                type: 'minecraft:crafting_shapeless',
                station: 'crafting',
                ingredients: [accepts('minecraft:stick'), null, accepts('minecraft:coal')],
                result: { identifier: 'minecraft:torch', count: 4 }
            })
        ]);

        expect(shapeless[0]?.ingredients).toHaveLength(2);
    });

    it('writes a smithing transform with its three slots and one output', () => {
        const { smithingTransform } = buildCraftingData([
            compiled({
                id: 'a',
                type: 'minecraft:smithing_transform',
                station: 'smithing',
                ingredients: [
                    accepts('minecraft:netherite_upgrade_smithing_template'),
                    accepts('minecraft:diamond_axe'),
                    accepts('minecraft:netherite_ingot')
                ],
                result: { identifier: 'minecraft:netherite_axe', count: 1 }
            })
        ]);

        expect(smithingTransform[0]).toMatchObject({
            station: 'smithing_table',
            template: { descriptor: { kind: 'name', name: 'minecraft:netherite_upgrade_smithing_template' } },
            base: { descriptor: { kind: 'name', name: 'minecraft:diamond_axe' } },
            addition: { descriptor: { kind: 'name', name: 'minecraft:netherite_ingot' } },
            output: { name: 'minecraft:netherite_axe', meta: 0, count: 1 }
        });
    });

    it('writes a smithing trim, which is the one recipe with no result', () => {
        const { smithingTrim, omitted } = buildCraftingData([
            compiled({
                id: 'a',
                type: 'minecraft:smithing_trim',
                station: 'smithing',
                ingredients: [
                    accepts('minecraft:coast_armor_trim_smithing_template'),
                    accepts('minecraft:iron_chestplate'),
                    accepts('minecraft:redstone')
                ]
            })
        ]);

        expect(omitted).toEqual([]);
        expect(smithingTrim[0]).toMatchObject({ station: 'smithing_table' });
    });

    it('writes one furnace entry per station tag, because the wire holds one station each', () => {
        const { furnace } = buildCraftingData([
            compiled({
                id: 'a',
                type: 'minecraft:campfire_cooking',
                station: 'campfire_cooking',
                ingredients: [accepts('minecraft:beef')],
                result: { identifier: 'minecraft:cooked_beef', count: 1 }
            })
        ]);

        expect(furnace.map((entry) => entry.station)).toEqual(['campfire', 'soul_campfire']);
    });

    describe('brewing', () => {
        const brewing = compiled({
            id: 'minecraft:brewing/awkward',
            type: 'minecraft:brewing',
            station: 'brewing',
            ingredients: [accepts('minecraft:potion'), accepts('minecraft:nether_wart')],
            result: { identifier: 'minecraft:potion', data: 4, count: 1 }
        });

        it('writes a potion mix with the numeric ids the entry carries', () => {
            const { potionMixes } = buildCraftingData([brewing], {
                items: (name) => ({ 'minecraft:potion': 426, 'minecraft:nether_wart': 294 })[name]
            });

            expect(potionMixes[0]).toEqual({
                id: 'minecraft:brewing/awkward',
                netId: 1,
                inputId: 426,
                inputMeta: 0,
                reagentId: 294,
                reagentMeta: 0,
                outputId: 426,
                outputMeta: 4
            });
        });

        it('omits the recipe rather than guessing when an id is missing', () => {
            const { potionMixes, omitted } = buildCraftingData([brewing]);

            expect(potionMixes).toEqual([]);
            expect(omitted[0]).toMatchObject({ recipeId: 'minecraft:brewing/awkward', type: 'minecraft:brewing' });
        });
    });

    describe('what has no Bedrock form', () => {
        it('reports every special serializer with a reason instead of dropping it', () => {
            const types = Object.keys(RECIPES_WITHOUT_A_BEDROCK_FORM);
            const recipes = types.map((type, index) =>
                compiled({ id: `test:${index}`, type: type as RecipeType, station: 'crafting', netId: index + 1 })
            );

            const result = buildCraftingData(recipes);

            expect(result.omitted).toHaveLength(types.length);
            expect(result.omitted.map((entry) => entry.type).sort()).toEqual([...types].sort());
            for (const entry of result.omitted) expect(entry.reason.length).toBeGreaterThan(0);
            expect(result.shaped).toEqual([]);
            expect(result.shapeless).toEqual([]);
        });

        it('reports a recipe that compiled without a result', () => {
            const { omitted } = buildCraftingData([
                compiled({ id: 'a', type: 'minecraft:crafting_shapeless', station: 'crafting' })
            ]);

            expect(omitted[0]?.reason).toContain('no result');
        });
    });

    describe('an ingredient the wire has no room for', () => {
        const anyPlank = compiled({
            id: 'test:planks',
            type: 'minecraft:crafting_shapeless',
            station: 'crafting',
            ingredients: [accepts('minecraft:oak_planks', 'minecraft:birch_planks')],
            result: { identifier: 'minecraft:stick', count: 4 }
        });

        it('narrows it to the first item and says what it dropped', () => {
            const { shapeless, widened } = buildCraftingData([anyPlank]);

            expect(widened).toEqual([
                { recipeId: 'test:planks', chosen: 'minecraft:oak_planks', dropped: ['minecraft:birch_planks'] }
            ]);
            expect(shapeless[0]?.ingredients[0]?.descriptor).toEqual({
                kind: 'name',
                name: 'minecraft:oak_planks',
                meta: ANY_META
            });
        });

        it('keeps the whole set when a Bedrock tag covers it', () => {
            const { shapeless, widened } = buildCraftingData([anyPlank], { bedrockTagFor: () => 'planks' });

            expect(widened).toEqual([]);
            expect(shapeless[0]?.ingredients[0]?.descriptor).toEqual({ kind: 'tag', tag: 'planks' });
        });
    });

    it('takes a priority and a symmetry flag from the caller, which Java has no field for', () => {
        const { shaped } = buildCraftingData([shapedRecipe], { priorityOf: () => 3, symmetric: true });

        expect(shaped[0]).toMatchObject({ priority: 3, symmetric: true });
    });
});

describe('network ids', () => {
    const recipe = (id: string): Recipe => ({
        id,
        type: 'minecraft:crafting_shapeless',
        station: 'crafting',
        ingredients: [],
        result: { count: 1 }
    });

    it('come from the recipes package and are not renumbered here', () => {
        const ordered = orderRecipes([recipe('minecraft:b'), recipe('minecraft:a')]);
        const ids = assignNetIds(ordered);
        const { shapeless } = buildCraftingData(
            ordered.map((entry) =>
                compiled({
                    id: entry.id,
                    type: 'minecraft:crafting_shapeless',
                    station: 'crafting',
                    netId: ids.get(entry.id) ?? 0,
                    ingredients: [accepts('minecraft:stick')],
                    result: { identifier: 'minecraft:stick', count: 1 }
                })
            )
        );

        expect(shapeless.map((entry) => [entry.id, entry.netId])).toEqual([
            ['minecraft:a', FIRST_RECIPE_NET_ID],
            ['minecraft:b', FIRST_RECIPE_NET_ID + 1]
        ]);
    });

    it('do not depend on the order the recipes were loaded in', () => {
        const names = ['zebra:a', 'minecraft:z', 'minecraft:a'];
        const forwards = assignNetIds(orderRecipes(names.map(recipe)));
        const backwards = assignNetIds(orderRecipes([...names].reverse().map(recipe)));

        expect([...forwards]).toEqual([...backwards]);
        expect([...forwards]).toEqual([
            ['minecraft:a', 1],
            ['minecraft:z', 2],
            ['zebra:a', 3]
        ]);
    });
});
