import type { Recipe } from './types';

/** The first network id assigned. Bedrock reserves 0 for "no recipe". */
export const FIRST_RECIPE_NET_ID = 1;

/** Splits an identifier into its namespace and path, defaulting the namespace to `minecraft`. */
const split = (id: string): readonly [string, string] => {
    const colon = id.indexOf(':');
    return colon === -1 ? ['minecraft', id] : [id.slice(0, colon), id.slice(colon + 1)];
};

/** Compares two strings by UTF-16 code unit, which is the same on every platform and locale. */
const compareCodeUnits = (left: string, right: string): number => (left < right ? -1 : left > right ? 1 : 0);

/**
 * Orders two recipe identifiers by namespace first, then by path, comparing
 * code units rather than collating. `localeCompare` would put the same two
 * recipes in different orders on different machines, and network ids that
 * depend on the order have to be reproducible.
 */
export const compareRecipeIds = (left: string, right: string): number => {
    const [leftNamespace, leftPath] = split(left);
    const [rightNamespace, rightPath] = split(right);
    return compareCodeUnits(leftNamespace, rightNamespace) || compareCodeUnits(leftPath, rightPath);
};

/**
 * Sorts recipes into the order the registry publishes them in. The plan takes
 * recipe network ids from registry order, so this order is the one thing in
 * the package that a client sees indirectly: it has to be a pure function of
 * the loaded identifiers and nothing else, which rules out load order, file
 * system order and insertion order.
 */
export const orderRecipes = (recipes: Iterable<Recipe>): readonly Recipe[] =>
    [...recipes].sort((left, right) => compareRecipeIds(left.id, right.id));

/**
 * Assigns a network id to every recipe, numbering the ordered list from
 * {@link FIRST_RECIPE_NET_ID}. Adding a recipe renumbers every recipe that
 * sorts after it, so a client that has cached ids has to be sent a fresh
 * recipe list after a reload.
 */
export const assignNetIds = (recipes: readonly Recipe[]): ReadonlyMap<string, number> =>
    new Map(recipes.map((recipe, index) => [recipe.id, index + FIRST_RECIPE_NET_ID]));
