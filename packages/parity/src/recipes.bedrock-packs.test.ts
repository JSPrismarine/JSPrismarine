import { join } from 'node:path';
import { expect, it } from 'vitest';

import { item_tags } from '@jsprismarine/bedrock-data';
import type { Diagnostic } from '@jsprismarine/content';
import { load, REGISTRY_IDS } from '@jsprismarine/packs';
import { javaRecipesFromBedrock } from '@jsprismarine/prismarine/crafting/bedrockRecipes';
import { loadRecipes, matchRecipe, recipeIngredients, recipeResult, STATION_BY_TYPE } from '@jsprismarine/recipes';
import type { Recipe, RecipeInput, RecipeItemStack } from '@jsprismarine/recipes';

import { FAMILIES } from './families.ts';
import { describeFamily } from './measure.ts';
import { reportParityProgress } from './progress.ts';
import { REFERENCES } from './references.ts';

/**
 * The input a recipe's own ingredients make: the first item each one accepts, in the slots the
 * recipe names. A shapeless recipe fills a 3x3 grid in ingredient order.
 *
 * @returns The input, or undefined for a recipe whose ingredients include one that accepts
 *   nothing, which the row reports on its own.
 */
const inputOf = (recipe: Recipe): RecipeInput | undefined => {
    const stack = (id: string | undefined): RecipeItemStack | undefined =>
        id === undefined ? undefined : { id, count: 1 };
    switch (recipe.type) {
        case 'minecraft:crafting_shaped': {
            const slots: (RecipeItemStack | null)[] = [];
            for (const cell of recipe.pattern.cells) {
                if (cell === null) slots.push(null);
                else {
                    const item = stack(cell.items[0]);
                    if (item === undefined) return undefined;
                    slots.push(item);
                }
            }
            return { station: 'crafting', grid: { width: recipe.pattern.width, height: recipe.pattern.height, slots } };
        }
        case 'minecraft:crafting_shapeless': {
            const slots: (RecipeItemStack | null)[] = Array.from({ length: 9 }, () => null);
            for (const [index, ingredient] of recipe.ingredients.entries()) {
                const item = stack(ingredient.items[0]);
                if (item === undefined) return undefined;
                slots[index] = item;
            }
            return { station: 'crafting', grid: { width: 3, height: 3, slots } };
        }
        case 'minecraft:smelting':
        case 'minecraft:blasting':
        case 'minecraft:smoking':
        case 'minecraft:campfire_cooking':
        case 'minecraft:stonecutting': {
            const item = stack(recipe.ingredient.items[0]);
            return item === undefined ? undefined : { station: STATION_BY_TYPE[recipe.type], item };
        }
        case 'minecraft:smithing_transform': {
            const template = stack(recipe.template?.items[0]);
            const base = stack(recipe.base.items[0]);
            const addition = stack(recipe.addition?.items[0]);
            if (base === undefined) return undefined;
            return { station: 'smithing', template: template ?? null, base, addition: addition ?? null };
        }
        case 'minecraft:smithing_trim': {
            const base = stack(recipe.base.items[0]);
            if (base === undefined) return undefined;
            return {
                station: 'smithing',
                template: stack(recipe.template?.items[0]) ?? null,
                base,
                addition: stack(recipe.addition?.items[0]) ?? null
            };
        }
        case 'minecraft:brewing': {
            // The input names its potion through a `potion_contents` predicate, so the bottle
            // carries the first potion the predicate accepts.
            const id = recipe.input.items[0];
            const potion = recipe.input.components.find((predicate) => predicate.potions !== undefined)?.potions?.[0];
            const reagent = stack(recipe.reagent.items[0]);
            if (id === undefined || reagent === undefined) return undefined;
            return {
                station: 'brewing',
                input: {
                    id,
                    count: 1,
                    ...(potion === undefined ? {} : { components: { 'minecraft:potion_contents': { potion } } })
                },
                reagent
            };
        }
        default:
            return undefined;
    }
};

/** What a recipe declares it makes: its result, or for a trim, the base it trims. */
const declaredOf = (recipe: Recipe): { readonly id?: string; readonly count?: number } | undefined =>
    recipe.type === 'minecraft:smithing_trim' ? { id: recipe.base.items[0], count: 1 } : recipeResult(recipe);

/**
 * A behavior pack's Bedrock recipes reach the recipe book restated in Java's grammar (issue
 * #3835). Mojang's own vanilla Bedrock recipe files are the largest real corpus of that grammar:
 * legacy item names with data values, rows of different lengths, Bedrock-only item tags,
 * ingredient counts, several stations per file, potion names, and a trim recipe whose templates
 * come from a tag. The server never loads these files itself,
 * since its vanilla recipes are Java's, so the corpus measures the translation an addon's
 * recipes go through.
 */
describeFamily(
    FAMILIES.recipesRegistry,
    [REFERENCES.bedrockBehaviorPack],
    () => {
        const checkout = REFERENCES.bedrockBehaviorPack.locate();
        if (checkout === undefined) throw new Error('the vanilla behavior pack is not in the fetch cache');
        const { definitions } = load([
            {
                kind: 'directory',
                path: join(checkout, 'behavior_pack'),
                skipRegistries: REGISTRY_IDS.filter((registry) => registry !== 'recipes')
            }
        ]);
        const diagnostics: Diagnostic[] = [];
        const { recipes: translated } = javaRecipesFromBedrock(
            definitions.recipes,
            diagnostics,
            (tag) => item_tags[tag]
        );
        const {
            book,
            failed,
            diagnostics: parseDiagnostics
        } = loadRecipes(translated.map(({ id, data }) => [id, data] as const));

        it("restates every vanilla Bedrock recipe it accepts in Java's grammar", () => {
            expect(translated.length).toBeGreaterThan(0);
            expect(
                failed,
                parseDiagnostics
                    .filter((entry) => entry.severity === 'error')
                    .map((entry) => `${entry.recipeId} ${entry.path}: ${entry.message}`)
                    .join('\n')
            ).toEqual([]);
        });

        it('gives every ingredient at least one item', () => {
            const empty = book.recipes.flatMap((recipe) =>
                recipeIngredients(recipe).flatMap((ingredient, slot) =>
                    ingredient !== null && ingredient.items.length === 0 ? [`${recipe.id} slot ${slot}`] : []
                )
            );
            expect(empty).toEqual([]);
        });

        it("crafts the declared result from the recipe's own ingredients", () => {
            const wrong = book.recipes.flatMap((recipe) => {
                const input = inputOf(recipe);
                if (input === undefined) return [`${recipe.id}: no input`];
                const declared = declaredOf(recipe);
                const made = matchRecipe(recipe, input)?.result;
                return made?.id === declared?.id && made?.count === declared?.count
                    ? []
                    : [`${recipe.id}: made ${made?.id ?? 'nothing'} x${made?.count ?? 0}`];
            });
            expect(wrong).toEqual([]);
        });

        it('reports how much of the vanilla corpus translates', () => {
            const count = (code: string) => diagnostics.filter((entry) => entry.code === code).length;
            reportParityProgress(FAMILIES.recipesRegistry, {
                bedrockRecipeFiles: definitions.recipes.size,
                bedrockRecipesRestated: book.recipes.length,
                bedrockRecipesUnsupported: count('recipe.unsupported'),
                bedrockRecipesInvalid: count('recipe.invalid')
            });
            expect(book.recipes.length).toBeGreaterThan(0);
        });
    },
    { tags: ['real-data'] }
);
