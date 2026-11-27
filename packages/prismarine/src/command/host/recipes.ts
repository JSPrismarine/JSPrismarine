/**
 * `/recipe give` and `/recipe take`, over each player's recipe book in `crafting/recipeBook.ts`.
 */
import type { EntityRef, RecipeChange } from '@jsprismarine/commands';
import type { RecipeBook } from '@jsprismarine/recipes';

import type Server from '../../Server';
import { isLearnableRecipe, lockRecipes, unlockRecipes } from '../../crafting/recipeBook';
import { playerSessionOf, refuse } from './support';

/** The recipe name `/recipe` means "every one of them" by. */
const ALL_RECIPES = '*';

/**
 * Unlocks or locks recipes for players.
 *
 * A recipe the book cannot hold, such as a firework recipe, is never unlocked, so naming one
 * changes nothing, as in Java.
 *
 * @param book - The compiled recipe book the stack loaded.
 * @param recipe - A recipe id, or `*` for every recipe in the book.
 * @param give - True to unlock, false to lock.
 * @returns How many recipes each player gained or lost, for each player still connected.
 * @throws {CommandSyntaxException} When the name is not one the book holds.
 * @javaSee RecipeCommand.giveRecipes
 * @javaSee RecipeCommand.takeRecipes
 */
export const changeRecipes = (
    server: Server,
    book: RecipeBook,
    players: readonly EntityRef[],
    recipe: string,
    give: boolean
): readonly RecipeChange[] => {
    const named = recipe === ALL_RECIPES ? book.recipes : [book.get(recipe) ?? refuse(`Unknown recipe: ${recipe}`)];
    const ids = named.filter(isLearnableRecipe).map((entry) => entry.id);

    return players.flatMap((ref) => {
        const session = playerSessionOf(server, ref);
        if (session === undefined) return [];

        const changed = give ? unlockRecipes(session, ids) : lockRecipes(session.keyed(), ids);
        return [{ player: session.identity.name, recipes: changed.length }];
    });
};
