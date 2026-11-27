import { FIRST_RECIPE_NET_ID, assignNetIds, orderRecipes } from '@jsprismarine/recipes';
import { describe, expect, it } from 'vitest';

import NetworkBinaryStream from '../../NetworkBinaryStream';
import { capture } from '../../testing/evidence.test.helper';
import { layoutAt } from '../../wire/WireLayout';
import { craftingDataPacket } from '../wire/definitions/craftingData';
import {
    ANY_META,
    MAP_CLONING_UUID,
    MULTI_RECIPE_UUIDS,
    RECIPES_WITHOUT_A_BEDROCK_FORM,
    SMITHING_TRIM_ENTRY,
    buildCraftingData
} from './craftingData';

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

    describe('smithing trims', () => {
        const trim = (id: string, netId: number): CompiledRecipe =>
            compiled({
                id,
                type: 'minecraft:smithing_trim',
                station: 'smithing',
                netId,
                ingredients: [
                    accepts(`${id}_armor_trim_smithing_template`),
                    accepts('minecraft:iron_chestplate'),
                    accepts('minecraft:redstone')
                ]
            });

        it('sends every trim recipe as the one entry the client trims anything with', () => {
            const { smithingTrim, recipesByNetId, omitted } = buildCraftingData([
                trim('minecraft:coast', 4),
                trim('minecraft:dune', 5)
            ]);

            expect(omitted).toEqual([]);
            expect(smithingTrim).toEqual([
                {
                    id: SMITHING_TRIM_ENTRY.id,
                    netId: 4,
                    station: 'smithing_table',
                    template: { descriptor: { kind: 'tag', tag: SMITHING_TRIM_ENTRY.template }, count: 1 },
                    base: { descriptor: { kind: 'tag', tag: SMITHING_TRIM_ENTRY.base }, count: 1 },
                    addition: { descriptor: { kind: 'tag', tag: SMITHING_TRIM_ENTRY.addition }, count: 1 }
                }
            ]);
            expect(recipesByNetId.get(4)).toEqual(['minecraft:coast', 'minecraft:dune']);
        });
    });

    describe('transmutes', () => {
        const redShulkerBox = compiled({
            id: 'minecraft:red_shulker_box',
            type: 'minecraft:crafting_transmute',
            station: 'crafting',
            netId: 3,
            blockTags: ['crafting_table'],
            ingredients: [
                accepts('minecraft:undyed_shulker_box', 'minecraft:red_shulker_box', 'minecraft:blue_shulker_box'),
                accepts('minecraft:red_dye')
            ],
            result: { identifier: 'minecraft:red_shulker_box', count: 1 }
        });

        it('sends one user data entry per input item, leaving out the input that is already the result', () => {
            const { userDataShapeless, shapeless, widened } = buildCraftingData([redShulkerBox]);

            expect(shapeless).toEqual([]);
            expect(widened).toEqual([]);
            expect(userDataShapeless.map((entry) => entry.ingredients[0]?.descriptor)).toEqual([
                { kind: 'name', name: 'minecraft:undyed_shulker_box', meta: ANY_META },
                { kind: 'name', name: 'minecraft:blue_shulker_box', meta: ANY_META }
            ]);
            for (const entry of userDataShapeless) {
                expect(entry.ingredients[1]?.descriptor).toEqual({
                    kind: 'name',
                    name: 'minecraft:red_dye',
                    meta: ANY_META
                });
                expect(entry.outputs).toEqual([{ name: 'minecraft:red_shulker_box', meta: 0, count: 1 }]);
            }
        });

        it('keeps the recipe’s own net id on the first entry and numbers the rest after every recipe', () => {
            const { userDataShapeless, recipesByNetId } = buildCraftingData([redShulkerBox, shapedRecipe]);

            expect(userDataShapeless.map((entry) => entry.netId)).toEqual([3, 8]);
            expect(new Set(userDataShapeless.map((entry) => entry.id)).size).toBe(2);
            expect(recipesByNetId.get(3)).toEqual(['minecraft:red_shulker_box']);
            expect(recipesByNetId.get(8)).toEqual(['minecraft:red_shulker_box']);
            expect(recipesByNetId.get(7)).toEqual(['minecraft:oak_planks']);
        });
    });

    describe('multi recipes', () => {
        const banner = (color: string, netId: number): CompiledRecipe =>
            compiled({
                id: `minecraft:${color}_banner_duplicate`,
                type: 'minecraft:crafting_special_bannerduplicate',
                station: 'crafting',
                netId,
                ingredients: [accepts(`minecraft:${color}_banner`)],
                result: { identifier: `minecraft:${color}_banner`, count: 1 }
            });

        it('sends the Java recipes one built-in recipe covers as one entry under the first one’s id', () => {
            const { multi, recipesByNetId } = buildCraftingData([banner('black', 2), banner('red', 9)]);

            expect(multi).toEqual([
                { uuid: MULTI_RECIPE_UUIDS['minecraft:crafting_special_bannerduplicate'], netId: 2 }
            ]);
            expect(recipesByNetId.get(2)).toEqual([
                'minecraft:black_banner_duplicate',
                'minecraft:red_banner_duplicate'
            ]);
        });

        it('sends a transmute with no result item of its own as map cloning', () => {
            const { multi, userDataShapeless } = buildCraftingData([
                compiled({
                    id: 'minecraft:map_cloning',
                    type: 'minecraft:crafting_transmute',
                    station: 'crafting',
                    ingredients: [accepts('minecraft:filled_map'), accepts('minecraft:map')]
                })
            ]);

            expect(userDataShapeless).toEqual([]);
            expect(multi).toEqual([{ uuid: MAP_CLONING_UUID, netId: 1 }]);
        });
    });

    // The UUIDs and the trim entry are the pinned server's, so each has to be in what it sent.
    describe.each([2193, 2225])('against the recipes the real server sent at protocol %i', (protocol) => {
        const sent = layoutAt(craftingDataPacket, protocol).decode(new NetworkBinaryStream(capture(protocol, 0x34)));

        it('names only built-in recipes the server sent', () => {
            const uuids = new Set(sent.multi.map((entry) => entry.uuid.toString('hex')));

            for (const uuid of [...Object.values(MULTI_RECIPE_UUIDS), MAP_CLONING_UUID]) {
                expect(uuids).toContain(uuid.replaceAll('-', ''));
            }
        });

        it('sends the trim entry the server sent', () => {
            expect(sent.smithingTrim).toEqual([
                expect.objectContaining({
                    id: SMITHING_TRIM_ENTRY.id,
                    station: 'smithing_table',
                    template: { descriptor: { kind: 'tag', tag: SMITHING_TRIM_ENTRY.template }, count: 1 },
                    base: { descriptor: { kind: 'tag', tag: SMITHING_TRIM_ENTRY.base }, count: 1 },
                    addition: { descriptor: { kind: 'tag', tag: SMITHING_TRIM_ENTRY.addition }, count: 1 }
                })
            ]);
        });
    });

    it('writes a cooking recipe as one shapeless entry per station tag, as BDS does', () => {
        const { shapeless, recipesByNetId } = buildCraftingData([
            compiled({
                id: 'a',
                netId: 1,
                type: 'minecraft:campfire_cooking',
                station: 'campfire_cooking',
                ingredients: [accepts('minecraft:beef')],
                result: { identifier: 'minecraft:cooked_beef', count: 1 }
            })
        ]);

        expect(shapeless.map((entry) => [entry.id, entry.station, entry.netId])).toEqual([
            ['a', 'campfire', 1],
            ['a_soul_campfire', 'soul_campfire', 2]
        ]);
        expect(shapeless[0]).toMatchObject({
            ingredients: [{ descriptor: { kind: 'name', name: 'minecraft:beef' }, count: 1 }],
            outputs: [{ name: 'minecraft:cooked_beef', count: 1 }]
        });
        // A furnace cooks by itself, so no craft request can name a cooking entry.
        expect(recipesByNetId.size).toBe(0);
    });

    it('writes a cooking input of several items as one entry per item, as BDS does', () => {
        const nuggets = compiled({
            id: 'minecraft:iron_nugget_from_smelting',
            netId: 4,
            type: 'minecraft:smelting',
            station: 'smelting',
            ingredients: [accepts('minecraft:iron_pickaxe', 'minecraft:iron_axe')],
            result: { identifier: 'minecraft:iron_nugget', count: 1 }
        });

        const { shapeless, widened } = buildCraftingData([nuggets]);
        expect(shapeless.map((entry) => [entry.id, entry.netId, entry.ingredients[0]?.descriptor])).toEqual([
            [
                'minecraft:iron_nugget_from_smelting',
                4,
                { kind: 'name', name: 'minecraft:iron_pickaxe', meta: ANY_META }
            ],
            [
                'minecraft:iron_nugget_from_smelting_from_iron_axe',
                5,
                { kind: 'name', name: 'minecraft:iron_axe', meta: ANY_META }
            ]
        ]);
        expect(widened).toEqual([]);
    });

    it('gives every entry of a cooking recipe its own id, across stations and inputs', () => {
        const { shapeless } = buildCraftingData([
            compiled({
                id: 'minecraft:cooked_beef_from_campfire_cooking',
                type: 'minecraft:campfire_cooking',
                station: 'campfire_cooking',
                ingredients: [accepts('minecraft:beef', 'minecraft:mutton')],
                result: { identifier: 'minecraft:cooked_beef', count: 1 }
            })
        ]);

        expect(shapeless.map((entry) => [entry.id, entry.station])).toEqual([
            ['minecraft:cooked_beef_from_campfire_cooking', 'campfire'],
            ['minecraft:cooked_beef_from_campfire_cooking_from_mutton', 'campfire'],
            ['minecraft:cooked_beef_from_campfire_cooking_soul_campfire', 'soul_campfire'],
            ['minecraft:cooked_beef_from_campfire_cooking_soul_campfire_from_mutton', 'soul_campfire']
        ]);
        expect(new Set(shapeless.map((entry) => entry.netId)).size).toBe(4);
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
