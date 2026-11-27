/**
 * Which recipes each player has unlocked, and what unlocking one does.
 *
 * Java keeps a recipe book per player, `ServerRecipeBook`, and a recipe gets into it two ways:
 * `/recipe give`, and the `rewards.recipes` of an advancement, which is how vanilla's 1739
 * `recipes/` advancements unlock a recipe once the player holds one of its ingredients. The book
 * is saved in the player record and sent whole at join, and each change after that is sent as a
 * delta. Every unlock also raises the `recipe_unlocked` trigger, which is what completes the
 * `recipes/` advancement of a recipe a command unlocked.
 *
 * The store is keyed by the player's key, like the advancement progress in
 * `advancement/progress.ts`, and lives from the load at join to the forget at leave. The session
 * hands its presenter over at the load, so a reward that only knows the player's key still
 * reaches its client.
 */
import type { Recipe } from '@jsprismarine/recipes';
import { SPECIAL_RECIPE_TYPES } from '@jsprismarine/recipes';

import { advancementsOf } from '../advancement/progress';
import { raiseAdvancement } from '../advancement/raise';
import { advancementSubject } from '../advancement/subject';
import type { AdvancementSubjectPlayer } from '../advancement/subject';
import type { KeyedPlayer, PlayerKeySource } from '../keyedPlayer';
import { playerKeyFrom } from '../keyedPlayer';
import type { SessionPresenter } from '../player/presenter/SessionPresenter';

/** Where a player's book changes are shown. */
export type RecipeBookPresenter = Pick<SessionPresenter, 'showRecipeBook'>;

interface Book {
    /** Java recipe ids, in the order they were unlocked. */
    readonly recipes: Set<string>;
    readonly presenter: RecipeBookPresenter | undefined;
}

const books = new Map<string, Book>();

const bookOf = (player: PlayerKeySource): Book => {
    const key = playerKeyFrom(player);
    const held = books.get(key);
    if (held !== undefined) return held;

    const created: Book = { recipes: new Set(), presenter: undefined };
    books.set(key, created);
    return created;
};

const SPECIAL_TYPES: ReadonlySet<string> = new Set<string>([
    ...SPECIAL_RECIPE_TYPES,
    'minecraft:crafting_decorated_pot',
    'minecraft:brewing'
]);

/**
 * Whether a recipe can be in the book. Java leaves out the recipes whose result its code works
 * out rather than the recipe file: the `crafting_special_` serializers and the decorated pot,
 * which extend `CustomRecipe`, and the brewing recipes.
 * @javaSee Recipe.isSpecial
 * @javaSee CustomRecipe.isSpecial
 * @javaSee BrewingRecipe.isSpecial
 */
export const isLearnableRecipe = (recipe: Pick<Recipe, 'type'>): boolean => !SPECIAL_TYPES.has(recipe.type);

/** The recipes one player has unlocked, in the order they were unlocked. */
export const recipeBookOf = (player: PlayerKeySource): readonly string[] => [
    ...(books.get(playerKeyFrom(player))?.recipes ?? [])
];

/**
 * Replaces a player's book with what was stored, and names where its changes are shown.
 *
 * @param stored - The record's `recipeBook`, or undefined for a record that has none.
 * @param presenter - The player's client.
 * @param fallback - The recipes of a record written before the book was saved, which are the
 *   ones its completed advancements reward.
 */
export const loadRecipeBook = (
    player: PlayerKeySource,
    stored: unknown,
    presenter: RecipeBookPresenter | undefined,
    fallback: () => readonly string[] = () => []
): void => {
    const recipes = Array.isArray(stored)
        ? stored.filter((entry): entry is string => typeof entry === 'string')
        : fallback();
    books.set(playerKeyFrom(player), { recipes: new Set(recipes), presenter });
};

/** Lets go of a player's book once it is saved. */
export const forgetRecipeBook = (player: PlayerKeySource): void => {
    books.delete(playerKeyFrom(player));
};

/** Sends the client the whole book, which it starts from at join. */
export const showRecipeBook = (player: PlayerKeySource): Promise<void> => {
    const book = bookOf(player);
    return book.presenter?.showRecipeBook({ kind: 'initial', recipes: [...book.recipes] }) ?? Promise.resolve();
};

/**
 * Unlocks recipes for a player: adds the ones the book lacks, shows them to the client, and raises
 * `recipe_unlocked` for each.
 *
 * @param player - The player, as the advancement triggers read it.
 * @param recipes - The recipes to unlock. The caller leaves out the ones
 *   {@link isLearnableRecipe} refuses.
 * @returns The recipes that were not unlocked before.
 * @javaSee ServerRecipeBook.addRecipes
 */
export const unlockRecipes = (player: AdvancementSubjectPlayer, recipes: readonly string[]): readonly string[] => {
    const book = bookOf(player.keyed());
    const added = recipes.filter((id) => !book.recipes.has(id));
    if (added.length === 0) return added;

    for (const id of added) book.recipes.add(id);
    void book.presenter?.showRecipeBook({ kind: 'unlocked', recipes: added });

    const keyed = player.keyed();
    if (keyed.server.getContent().advancements.listensFor('recipe_unlocked')) {
        const subject = advancementSubject(player);
        for (const recipe of added) raiseAdvancement(player, 'recipe_unlocked', { player: subject, recipe });
    }
    return added;
};

/**
 * Locks recipes for a player and shows the client the ones it lost.
 *
 * @returns The recipes that were unlocked and now are not.
 * @javaSee ServerRecipeBook.removeRecipes
 */
export const lockRecipes = (player: PlayerKeySource, recipes: readonly string[]): readonly string[] => {
    const book = bookOf(player);
    const removed = recipes.filter((id) => book.recipes.delete(id));
    if (removed.length > 0) void book.presenter?.showRecipeBook({ kind: 'locked', recipes: removed });
    return removed;
};

/**
 * The recipes a player's completed advancements reward, which is what a record written before the
 * book was saved starts from: those players earned the rewards while nothing paid them. Read after
 * the player's advancement progress is loaded.
 */
export const rewardedRecipesOf = (keyed: KeyedPlayer): readonly string[] => {
    const content = keyed.server.getContent();
    const progress = advancementsOf(keyed);
    return Object.keys(progress.toJSON()).flatMap((id) => {
        const advancement = content.advancements.get(id);
        if (advancement === undefined || !progress.isDone(advancement)) return [];
        return advancement.rewards.recipes.filter((recipe) => {
            const known = content.recipes.get(recipe);
            return known !== undefined && isLearnableRecipe(known);
        });
    });
};
