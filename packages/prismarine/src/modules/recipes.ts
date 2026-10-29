import type { Module } from '@jsprismarine/kernel';

import StationRegistry from '../crafting/CraftingStation';
import { RecipeManager } from '../crafting/RecipeManager';
import type { RecipeManagerServer } from '../crafting/RecipeManager';
import { recipesToken, stationsToken } from './tokens';

/**
 * Provides the {@link RecipeManager} as `prismarine:recipes`. Starting the
 * module loads the vanilla recipe book; stopping it empties the book.
 *
 * @param server - The slice of the server the recipe manager reads.
 * @returns The module to register on the kernel.
 */
export const recipesModule = (server: RecipeManagerServer): Module => {
    const recipes = new RecipeManager(server);
    return {
        id: 'prismarine:recipes',
        register: (ctx) => {
            ctx.provide(recipesToken, recipes);
        },
        start: () => recipes.enable(),
        stop: () => recipes.disable()
    };
};

/**
 * Provides the {@link StationRegistry} as `prismarine:stations`. It depends on
 * `prismarine:recipes` because the registry derives a recipe-driven station for
 * every block the loaded recipe book mentions, so it must start after the book
 * is loaded.
 *
 * @returns The module to register on the kernel.
 */
export const stationsModule = (): Module => {
    const stations = new StationRegistry();
    return {
        id: 'prismarine:stations',
        dependencies: [recipesToken],
        register: (ctx) => {
            ctx.provide(stationsToken, stations);
        },
        start: (ctx) => {
            const recipes = ctx.use(recipesToken);
            stations.registerRecipeStations({ getRecipeManager: () => recipes });
        }
    };
};
