import { item_id_map as ItemIdMap } from '@jsprismarine/bedrock-data';
import { describe, expect, it } from 'vitest';

import { Item } from '../item/Item';
import CraftingGrid from './CraftingGrid';
import { RecipeDrivenStation, StationRegistry } from './CraftingStation';
import type { Recipe } from './Recipe';
import { ShapelessRecipe } from './Recipe';
import RecipeManager from './RecipeManager';
import { ItemIngredient } from './RecipeIngredient';
import VanillaRecipes from './VanillaRecipes';

const known = (name: string) => (ItemIdMap as Record<string, number>)[name] !== undefined;
const item = (name: string) => new Item({ id: 1, name });

/** A server carrying a real recipe book, so matching runs against vanilla's own data. */
const serverWith = (recipes: readonly Recipe[]) => {
    const manager = new RecipeManager({ getLogger: () => ({ debug: () => {} }), emit: async () => {} } as any);
    const server = { getRecipeManager: () => manager } as any;

    return { server, manager, recipes };
};

describe('crafting', () => {
    describe('RecipeDrivenStation', () => {
        it('makes a stick out of two planks, from the real recipe book', async () => {
            // The end to end check of the data layer and the matcher together: no fixture,
            // vanilla's own shaped recipe, matched against a grid a player could have filled.
            //
            // `minecraft:oak_planks`, and the emphasis is on a grid a player *could* have
            // filled. This used to ask for `minecraft:planks`, which is what Mojang's recipe
            // file writes - but no player has ever held one: the name predates the flattening
            // and the item table has no entry for it. The test passed on an item that cannot
            // exist. The generator now renames it, and because the file asks for any plank at
            // all, expands the recipe into one per wood.
            const { server, manager } = serverWith([]);
            for (const recipe of VanillaRecipes.load(known)) await manager.registerRecipe(recipe);

            const station = new RecipeDrivenStation('crafting_table', server);
            const planks = item('minecraft:oak_planks');
            const grid = new CraftingGrid(2, 2, [planks, null, planks, null]);

            const matched = station.match(grid);

            expect(matched).not.toBeNull();
            expect(matched!.getOutputs()[0]!.getName()).toBe('minecraft:stick');
        });

        it('answers nothing for a grid that is no recipe', async () => {
            const { server, manager } = serverWith([]);
            for (const recipe of VanillaRecipes.load(known)) await manager.registerRecipe(recipe);

            const station = new RecipeDrivenStation('crafting_table', server);
            const odd = new CraftingGrid(2, 2, [
                item('minecraft:crimson_planks'),
                item('minecraft:diamond'),
                null,
                null
            ]);

            expect(station.match(odd)).toBeNull();
        });

        it('answers nothing for an empty grid, without walking the book', async () => {
            const { server, manager } = serverWith([]);
            for (const recipe of VanillaRecipes.load(known)) await manager.registerRecipe(recipe);

            expect(
                new RecipeDrivenStation('crafting_table', server).match(
                    new CraftingGrid(2, 2, [null, null, null, null])
                )
            ).toBeNull();
        });

        it('only considers recipes belonging to its own block', async () => {
            const { server, manager } = serverWith([]);
            await manager.registerRecipe(
                new ShapelessRecipe('f', 'furnace', [new ItemIngredient('minecraft:stone')], [item('minecraft:x')])
            );

            expect(
                new RecipeDrivenStation('crafting_table', server).match(
                    new CraftingGrid(1, 1, [item('minecraft:stone')])
                )
            ).toBeNull();
            expect(
                new RecipeDrivenStation('furnace', server).match(new CraftingGrid(1, 1, [item('minecraft:stone')]))
            ).not.toBeNull();
        });
    });

    describe('StationRegistry', () => {
        it('derives a station for every block the recipe book mentions', async () => {
            // Derived rather than listed, so a plugin's recipe brings its station with it and
            // nothing has to keep a second list in step.
            const { server, manager } = serverWith([]);
            for (const recipe of VanillaRecipes.load(known)) await manager.registerRecipe(recipe);

            const registry = new StationRegistry();
            registry.registerRecipeStations(server);

            expect(registry.get('crafting_table')).not.toBeNull();
            expect(registry.get('furnace')).not.toBeNull();
            expect(registry.get('stonecutter')).not.toBeNull();
            expect(registry.get('nowhere')).toBeNull();
        });

        it('lets a station be replaced, which is how a block gets behaviour of its own', () => {
            // The anvil is why this interface exists: it has no recipes, it computes.
            const registry = new StationRegistry();
            const custom = { block: 'anvil', match: () => null };

            registry.register({ block: 'anvil', match: () => null });
            registry.register(custom);

            expect(registry.get('anvil')).toBe(custom);
            expect(registry.getStations().filter((s) => s.block === 'anvil')).toHaveLength(1);
        });
    });
});
