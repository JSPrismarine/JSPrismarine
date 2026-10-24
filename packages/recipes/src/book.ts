import type { RecipeContext } from './context';
import { EMPTY_CONTEXT } from './context';
import type { RecipeInput, RecipeMatch } from './match';
import { matchRecipe } from './match';
import { assignNetIds, orderRecipes } from './order';
import type { RecipeDiagnostic } from './parse';
import { parseRecipe } from './parse';
import type { Recipe, RecipeStation } from './types';

/**
 * Every loaded recipe, ordered, numbered, and indexed by station. This is
 * the object the server holds: it answers "what does this grid make" and
 * "what network id does this recipe have" without the caller knowing how
 * either is worked out.
 */
export interface RecipeBook {
    /** Every recipe in registry order, which is also network id order. */
    readonly recipes: readonly Recipe[];
    /** The network id of every recipe, keyed by identifier. */
    readonly netIds: ReadonlyMap<string, number>;
    /** One recipe by identifier. */
    get(id: string): Recipe | undefined;
    /** Every recipe matched at one station, in registry order. */
    byStation(station: RecipeStation): readonly Recipe[];
    /** The first recipe that accepts the input, in registry order. */
    match(input: RecipeInput): RecipeMatch | undefined;
    /** Every recipe that accepts the input, in registry order. */
    matchAll(input: RecipeInput): readonly RecipeMatch[];
}

/**
 * Builds a recipe book from parsed recipes. Two recipes with the same
 * identifier collapse to the last one given, which is how a later datapack
 * overrides an earlier one.
 *
 * @param context - Injected registry lookups, passed on to every match.
 */
export const createRecipeBook = (recipes: Iterable<Recipe>, context: RecipeContext = EMPTY_CONTEXT): RecipeBook => {
    const byId = new Map<string, Recipe>();
    for (const recipe of recipes) byId.set(recipe.id, recipe);

    const ordered = orderRecipes(byId.values());
    const netIds = assignNetIds(ordered);
    const byStation = new Map<RecipeStation, Recipe[]>();
    for (const recipe of ordered) {
        const station = byStation.get(recipe.station) ?? [];
        station.push(recipe);
        byStation.set(recipe.station, station);
    }

    const candidates = (input: RecipeInput): readonly Recipe[] => byStation.get(input.station) ?? [];

    return {
        recipes: ordered,
        netIds,
        get: (id) => byId.get(id),
        byStation: (station) => byStation.get(station) ?? [],
        match: (input) => {
            for (const recipe of candidates(input)) {
                const match = matchRecipe(recipe, input, context);
                if (match !== undefined) return match;
            }
            return undefined;
        },
        matchAll: (input) =>
            candidates(input).flatMap((recipe) => {
                const match = matchRecipe(recipe, input, context);
                return match === undefined ? [] : [match];
            })
    };
};

/** A recipe book plus everything that went wrong while reading the files behind it. */
export interface RecipeLoadResult {
    readonly book: RecipeBook;
    readonly diagnostics: readonly RecipeDiagnostic[];
    /** Identifiers whose file failed to parse, so the book does not hold them. */
    readonly failed: readonly string[];
}

/**
 * Parses a set of recipe files and builds a book from the ones that read.
 * A file with an error is left out and named in `failed`; the rest load, so
 * one broken datapack file does not take the server down.
 *
 * @param files - Recipe identifier to parsed recipe JSON, such as the `recipesJava` map `@jsprismarine/packs` produces.
 */
export const loadRecipes = (
    files: Iterable<readonly [string, unknown]>,
    context: RecipeContext = EMPTY_CONTEXT
): RecipeLoadResult => {
    const recipes: Recipe[] = [];
    const diagnostics: RecipeDiagnostic[] = [];
    const failed: string[] = [];
    for (const [id, source] of files) {
        const result = parseRecipe(id, source, context.tags);
        diagnostics.push(...result.diagnostics);
        if (result.recipe === undefined) failed.push(id);
        else recipes.push(result.recipe);
    }
    return { book: createRecipeBook(recipes, context), diagnostics, failed };
};
