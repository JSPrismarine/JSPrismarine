import type { RecipeBook } from './book';
import type { Ingredient } from './ingredient';
import { assignNetIds, orderRecipes } from './order';
import type { Recipe, RecipeStation, RecipeType } from './types';
import { recipeIngredients, recipeResult } from './types';

/** One Bedrock item reference: the identifier plus the legacy damage value where one selects a sub-item. */
export interface BedrockItemRef {
    readonly identifier: string;
    readonly data?: number;
}

/**
 * What a Java item lookup produced. `@jsprismarine/mapping`'s
 * `javaItemToBedrock` returns exactly this shape, which is how the two
 * packages meet without this one depending on that one at runtime.
 */
export type JavaItemMapping =
    /** The Bedrock item registry knows the item. */
    | { readonly kind: 'mapped'; readonly bedrock: BedrockItemRef }
    /** A reviewed loss: the Java identity does not survive, and `bedrock` is the listed fallback. */
    | { readonly kind: 'loss'; readonly bedrock: BedrockItemRef; readonly loss: { readonly reason: string } }
    /** Custom content, passed through untouched. */
    | { readonly kind: 'passthrough'; readonly bedrock: BedrockItemRef }
    /** No Bedrock item at all. */
    | { readonly kind: 'unknown'; readonly javaId: string };

/** The item half of the Java-to-Bedrock seam, injected so this package depends on no mapping table. */
export type JavaItemMapper = (javaId: string) => JavaItemMapping;

/**
 * The Bedrock block tags that put a recipe in front of a station, from the
 * tags the vanilla Bedrock pack's 1892 recipe files carry
 * (`docs/research/bedrock-blocks-items-recipes-biomes-features.md` section 4).
 * A campfire recipe carries both campfire tags, which is how Bedrock gives
 * one Java `campfire_cooking` recipe to both campfire blocks.
 */
export const BEDROCK_STATION_TAGS = {
    crafting: ['crafting_table'],
    smelting: ['furnace'],
    blasting: ['blast_furnace'],
    smoking: ['smoker'],
    campfire_cooking: ['campfire', 'soul_campfire'],
    stonecutting: ['stonecutter'],
    smithing: ['smithing_table'],
    brewing: ['brewing_stand']
} as const satisfies Record<RecipeStation, readonly string[]>;

/** One compiled ingredient: every Bedrock item it accepts, plus the Java tags it was written as. */
export interface CompiledIngredient {
    readonly items: readonly BedrockItemRef[];
    /** The Java item tags the ingredient came from, kept so a caller can emit a Bedrock tag descriptor instead. */
    readonly tags: readonly string[];
}

/** One compiled result stack. */
export interface CompiledResult extends BedrockItemRef {
    readonly count: number;
}

/** One recipe translated to Bedrock identifiers, ready for a `CraftingDataPacket` entry. */
export interface CompiledRecipe {
    readonly id: string;
    readonly type: RecipeType;
    readonly station: RecipeStation;
    /** The network id, from registry order. */
    readonly netId: number;
    /** The Bedrock block tags the client needs to show the recipe at a station. */
    readonly blockTags: readonly string[];
    /** The pattern size, for `minecraft:crafting_shaped` only. */
    readonly shape?: { readonly width: number; readonly height: number };
    /**
     * Ingredients in the same order {@link recipeIngredients} reports them:
     * row-major pattern cells for a shaped recipe, declaration order
     * otherwise. `null` is an empty shaped cell or an omitted optional slot.
     */
    readonly ingredients: readonly (CompiledIngredient | null)[];
    /**
     * The result, or `undefined` for the recipes that build theirs from an
     * input stack: `repair_item`, `smithing_trim`, `map_cloning` and
     * `map_extending`. A Bedrock client cannot be shown those as a plain
     * result and the server has to answer for them.
     */
    readonly result?: CompiledResult;
}

/** One place the Java-to-Bedrock mapping lost information while compiling a recipe. */
export interface RecipeCompileLoss {
    readonly recipeId: string;
    readonly javaId: string;
    /** Whether the identifier was on the input or the output side. */
    readonly where: 'ingredient' | 'result';
    readonly reason: string;
}

/** One identifier a recipe uses that has no Bedrock item at all. */
export interface RecipeCompileGap {
    readonly recipeId: string;
    readonly javaId: string;
    readonly where: 'ingredient' | 'result';
    /** Whether the gap cost the whole recipe, which happens when the result or a whole ingredient is unmappable. */
    readonly dropped: boolean;
}

/** Everything {@link compileRecipes} produced, including the recipes it could not translate cleanly. */
export interface RecipeCompileReport {
    /** Every recipe that compiled, in network id order. */
    readonly recipes: readonly CompiledRecipe[];
    /** Every reviewed loss. The recipes are still in `recipes`; the losses are listed so a dashboard can count them. */
    readonly losses: readonly RecipeCompileLoss[];
    /** Every identifier with no Bedrock item, and whether the recipe survived without it. */
    readonly gaps: readonly RecipeCompileGap[];
    /** Recipes left out entirely, with the identifier that cost them. */
    readonly dropped: readonly { readonly recipeId: string; readonly javaId: string }[];
}

/** Compiles one ingredient, collecting the losses and gaps its entries hit. */
const compileIngredient = (
    recipeId: string,
    ingredient: Ingredient,
    mapper: JavaItemMapper,
    losses: RecipeCompileLoss[],
    gaps: RecipeCompileGap[]
): CompiledIngredient => {
    const items: BedrockItemRef[] = [];
    for (const javaId of ingredient.items) {
        const mapping = mapper(javaId);
        if (mapping.kind === 'unknown') {
            gaps.push({ recipeId, javaId, where: 'ingredient', dropped: false });
            continue;
        }
        if (mapping.kind === 'loss')
            losses.push({ recipeId, javaId, where: 'ingredient', reason: mapping.loss.reason });
        items.push(mapping.bedrock);
    }
    return { items, tags: ingredient.tags };
};

/**
 * Translates recipes to Bedrock identifiers through an injected mapper and
 * numbers them from registry order.
 *
 * Nothing is dropped silently. A reviewed loss keeps the recipe and is
 * listed in `losses`. An identifier with no Bedrock item is listed in
 * `gaps`; it costs the whole recipe only when it is the result or when it
 * empties an ingredient, and those recipes are named in `dropped`.
 *
 * @param recipes - Parsed recipes, or a {@link RecipeBook}'s `recipes` list.
 * @param mapper - The Java-to-Bedrock item lookup, such as `javaItemToBedrock` from `@jsprismarine/mapping`.
 */
export const compileRecipes = (recipes: Iterable<Recipe>, mapper: JavaItemMapper): RecipeCompileReport => {
    const ordered = orderRecipes(recipes);
    const netIds = assignNetIds(ordered);
    const compiled: CompiledRecipe[] = [];
    const losses: RecipeCompileLoss[] = [];
    const gaps: RecipeCompileGap[] = [];
    const dropped: { recipeId: string; javaId: string }[] = [];

    for (const recipe of ordered) {
        const pending: RecipeCompileLoss[] = [];
        const pendingGaps: RecipeCompileGap[] = [];
        let lost: string | undefined;

        const ingredients = recipeIngredients(recipe).map((ingredient) => {
            if (ingredient === null) return null;
            const compiledIngredient = compileIngredient(recipe.id, ingredient, mapper, pending, pendingGaps);
            if (compiledIngredient.items.length === 0 && ingredient.items.length > 0) lost ??= ingredient.items[0];
            return compiledIngredient;
        });

        const template = recipeResult(recipe);
        let result: CompiledResult | undefined;
        if (template?.id !== undefined) {
            const mapping = mapper(template.id);
            if (mapping.kind === 'unknown') {
                pendingGaps.push({ recipeId: recipe.id, javaId: template.id, where: 'result', dropped: true });
                lost ??= template.id;
            } else {
                if (mapping.kind === 'loss')
                    pending.push({
                        recipeId: recipe.id,
                        javaId: template.id,
                        where: 'result',
                        reason: mapping.loss.reason
                    });
                result = { ...mapping.bedrock, count: template.count };
            }
        }

        losses.push(...pending);
        if (lost !== undefined) {
            gaps.push(...pendingGaps.map((gap) => ({ ...gap, dropped: true })));
            dropped.push({ recipeId: recipe.id, javaId: lost });
            continue;
        }
        gaps.push(...pendingGaps);

        compiled.push({
            id: recipe.id,
            type: recipe.type,
            station: recipe.station,
            netId: netIds.get(recipe.id) ?? 0,
            blockTags: BEDROCK_STATION_TAGS[recipe.station],
            ...(recipe.type === 'minecraft:crafting_shaped'
                ? { shape: { width: recipe.pattern.width, height: recipe.pattern.height } }
                : {}),
            ingredients,
            ...(result !== undefined ? { result } : {})
        });
    }

    return { recipes: compiled, losses, gaps, dropped };
};

/** Compiles every recipe in a book, keeping the book's network ids. */
export const compileRecipeBook = (book: RecipeBook, mapper: JavaItemMapper): RecipeCompileReport =>
    compileRecipes(book.recipes, mapper);
