import { describe, expect, it } from 'vitest';

import { startTestModule, stubService } from '@jsprismarine/kernel/testing';
import { stub } from '../testing/stub.test.helper';
import type { RecipeManager } from '../crafting/RecipeManager';
import type { Recipe } from '../crafting/Recipe';
import { recipesModule, stationsModule } from './recipes';
import { recipesToken, stationsToken } from './tokens';

describe('modules/recipes', () => {
    it('provides a recipe manager that loaded the vanilla book on start', async () => {
        const handle = await startTestModule(
            recipesModule({ getLogger: () => ({ debug: () => {} }), emit: async () => {} })
        );
        try {
            const recipes = handle.get(recipesToken).getRecipes();
            expect(recipes.length).toBeGreaterThan(0);
            // Net ids are positional and one-based; the first recipe must answer to 1.
            expect(handle.get(recipesToken).getByNetId(1)).toBe(recipes[0]);
        } finally {
            await handle.stop();
        }
    });
});

describe('modules/stations', () => {
    it('derives a station for every block the stubbed recipe book mentions', async () => {
        const handle = await startTestModule(stationsModule(), {
            stubs: [
                stubService(
                    recipesToken,
                    stub<RecipeManager>({
                        getRecipes: () => [stub<Recipe>({ station: 'crafting_table' })],
                        getRecipesFor: () => []
                    })
                )
            ]
        });
        try {
            const stations = handle.get(stationsToken);
            expect(stations.get('crafting_table')).not.toBeNull();
            expect(stations.get('stonecutter')).toBeNull();
        } finally {
            await handle.stop();
        }
    });
});
