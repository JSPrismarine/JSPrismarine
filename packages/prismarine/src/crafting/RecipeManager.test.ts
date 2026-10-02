import { describe, expect, it, vi } from 'vitest';

import { Item } from '../item/Item';
import RecipeManager from './RecipeManager';
import { ShapelessRecipe } from './Recipe';
import { ItemIngredient } from './RecipeIngredient';

/** A server that records what was emitted, and can cancel it. */
const fakeServer = (onEmit: (event: string, payload: any) => void = () => {}) =>
    ({
        getLogger: () => ({ debug: () => {} }),
        emit: async (event: string, payload: any) => onEmit(event, payload)
    }) as any;

const recipe = (id: string, station = 'crafting_table') =>
    new ShapelessRecipe(
        id,
        station,
        [new ItemIngredient('minecraft:stick')],
        [new Item({ id: 1, name: 'minecraft:torch' })]
    );

describe('crafting', () => {
    describe('RecipeManager', () => {
        it('names a recipe by its position, one-based', async () => {
            // The whole reason this is one list: `CraftingDataPacket` writes them in order and
            // an item stack request names one by that number. Disagree and a player crafts
            // something they did not choose.
            const manager = new RecipeManager(fakeServer());
            const first = recipe('a');
            const second = recipe('b');

            await manager.registerRecipe(first);
            await manager.registerRecipe(second);

            expect(manager.getNetId(first)).toBe(1);
            expect(manager.getNetId(second)).toBe(2);
            expect(manager.getByNetId(2)).toBe(second);
        });

        it('has nothing at net id zero, nor past the end', async () => {
            const manager = new RecipeManager(fakeServer());
            await manager.registerRecipe(recipe('a'));

            expect(manager.getByNetId(0)).toBeNull();
            expect(manager.getByNetId(99)).toBeNull();
        });

        it('refuses a duplicate id', async () => {
            const manager = new RecipeManager(fakeServer());
            await manager.registerRecipe(recipe('a'));

            await expect(manager.registerRecipe(recipe('a'))).rejects.toThrow(/already registered/);
        });

        it('keeps a station in priority order, most specific first', async () => {
            const manager = new RecipeManager(fakeServer());
            const loose = new ShapelessRecipe('loose', 'crafting_table', [], [], 9);
            const specific = new ShapelessRecipe('specific', 'crafting_table', [], [], 1);

            await manager.registerRecipe(loose);
            await manager.registerRecipe(specific);

            expect(manager.getRecipesFor('crafting_table').map((r) => r.id)).toEqual(['specific', 'loose']);
            // Not the main list though: a net id is a position in that one.
            expect(manager.getNetId(loose)).toBe(1);
        });

        it('indexes by station', async () => {
            const manager = new RecipeManager(fakeServer());
            await manager.registerRecipe(recipe('a', 'crafting_table'));
            await manager.registerRecipe(recipe('b', 'furnace'));

            expect(manager.getRecipesFor('furnace').map((r) => r.id)).toEqual(['b']);
            // A station nobody registered for is an empty list, not a failure: a plugin's
            // station names itself, and one this server never heard of is simply never asked.
            expect(manager.getRecipesFor('nonesuch')).toEqual([]);
        });

        it('bumps its revision, so a cache can notice a plugin', async () => {
            // Copied from `BlockStateSchemas`. The encoded recipe packet is worth caching -
            // identical for every player - and this is what lets that cache spot a
            // registration without knowing plugins exist.
            const manager = new RecipeManager(fakeServer());
            const before = manager.revision;

            await manager.registerRecipe(recipe('a'));

            expect(manager.revision).toBeGreaterThan(before);
        });

        it('announces a registration, and a listener can refuse it', async () => {
            // There is no unregister on purpose - a net id is a position, so removing one
            // would renumber everything after it - so cancelling is how a vanilla recipe goes.
            const cancel = vi.fn((_event: string, payload: any) => payload.preventDefault());
            const manager = new RecipeManager(fakeServer(cancel));

            await manager.registerRecipe(recipe('a'));

            expect(cancel).toHaveBeenCalledWith('recipeRegister', expect.anything());
            expect(manager.getRecipes()).toHaveLength(0);
            expect(manager.getById('a')).toBeNull();
        });
    });
});
