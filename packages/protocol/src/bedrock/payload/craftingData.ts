/**
 * `CraftingDataPacket`: every recipe the client is allowed to know about.
 *
 * At protocol 2193 the packet is eleven arrays and a flag, and a recipe's
 * type is the array it sits in rather than a tag in front of it. That is the
 * shape this module produces, one named list per array, so a writer loops
 * over the lists in order and never has to decide what a recipe is.
 *
 * Java has twenty-two recipe serializers and Bedrock has these lists, so the
 * mapping is lossy in both directions and the losses are named rather than
 * swallowed. {@link CraftingDataResult.omitted} carries a reason per recipe
 * and {@link CraftingDataResult.widened} carries every ingredient that had
 * to be narrowed to one item because the wire has no "any of these" slot.
 *
 * Network ids come from `@jsprismarine/recipes`, which sorts by namespace
 * and then path and numbers from 1 because Bedrock reserves 0 for "no
 * recipe". Nothing here renumbers them.
 */
import { BEDROCK_STATION_TAGS } from '@jsprismarine/recipes';

import type { ItemIdLookup } from './creativeContent';

import type { BedrockItemRef, CompiledIngredient, CompiledRecipe, RecipeType } from '@jsprismarine/recipes';

/** The aux value that means "any damage", which is what an ingredient uses when it does not care. */
export const ANY_META = 32767;

/** What one slot of a recipe accepts: an item, a Bedrock item tag, or nothing. */
export type IngredientDescriptor = { kind: 'name'; name: string; meta: number } | { kind: 'tag'; tag: string };

/** One slot, in the form `CraftingDataPacket` writes: a descriptor and a count, or an empty slot. */
export interface WireIngredient {
    /** Null for an empty slot, which a shaped pattern still has to write. */
    readonly descriptor: IngredientDescriptor | null;
    readonly count: number;
}

/** One output stack. */
export interface WireResult {
    readonly name: string;
    readonly meta: number;
    readonly count: number;
}

/** Fields every recipe entry carries. */
interface RecipeEntryBase {
    /** The recipe's identifier, which the client keys its book on. */
    readonly id: string;
    /** The deterministic id `@jsprismarine/recipes` assigned, counting from 1. */
    readonly netId: number;
    /** The Bedrock block tag of the station, such as `crafting_table`. */
    readonly station: string;
}

/** A shaped crafting recipe. */
export interface ShapedRecipeEntry extends RecipeEntryBase {
    readonly width: number;
    readonly height: number;
    /** `width * height` slots in row-major order, empty slots included. */
    readonly pattern: readonly WireIngredient[];
    readonly outputs: readonly WireResult[];
    readonly priority: number;
    /** Whether the client may match the pattern mirrored. */
    readonly symmetric: boolean;
}

/** A shapeless crafting recipe, which is also how a stonecutter recipe travels. */
export interface ShapelessRecipeEntry extends RecipeEntryBase {
    readonly ingredients: readonly WireIngredient[];
    readonly outputs: readonly WireResult[];
    readonly priority: number;
}

/** A smithing table recipe that produces a new item. */
export interface SmithingTransformEntry extends RecipeEntryBase {
    readonly template: WireIngredient;
    readonly base: WireIngredient;
    readonly addition: WireIngredient;
    readonly output: WireResult;
}

/** A smithing table recipe that writes a trim onto the base rather than replacing it. */
export interface SmithingTrimEntry extends RecipeEntryBase {
    readonly template: WireIngredient;
    readonly base: WireIngredient;
    readonly addition: WireIngredient;
}

/** A brewing stand recipe that turns one potion into another. */
export interface PotionMixEntry {
    readonly id: string;
    readonly netId: number;
    readonly inputId: number;
    readonly inputMeta: number;
    readonly reagentId: number;
    readonly reagentMeta: number;
    readonly outputId: number;
    readonly outputMeta: number;
}

/** A cooking recipe. There is no list for one at protocol 2193; see the README. */
export interface FurnaceRecipeEntry extends RecipeEntryBase {
    readonly input: WireIngredient;
    readonly output: WireResult;
}

/** A recipe with no Bedrock form, and why. */
export interface OmittedRecipe {
    readonly recipeId: string;
    readonly type: RecipeType;
    readonly reason: string;
}

/** An ingredient that accepted several items where the wire has room for one. */
export interface WidenedIngredient {
    readonly recipeId: string;
    /** The item the slot was narrowed to. */
    readonly chosen: string;
    /** The items the slot no longer accepts. */
    readonly dropped: readonly string[];
}

/**
 * Why each Java serializer with no Bedrock form has none.
 *
 * Every one of them is a Bedrock multi recipe, which is a bare UUID plus a
 * network id: the client holds the behavior and matches the UUID against a
 * list compiled into it. Reproducing one means knowing that UUID, and no
 * capture of `CraftingDataPacket` is in this repository to read it from.
 */
export const RECIPES_WITHOUT_A_BEDROCK_FORM: Partial<Record<RecipeType, string>> = {
    'minecraft:crafting_decorated_pot': 'The client crafts a decorated pot itself; Bedrock has no data form.',
    'minecraft:crafting_dye': 'Dyeing is a multi recipe, keyed by a UUID the client has compiled in.',
    'minecraft:crafting_imbue': 'Imbuing is a multi recipe, keyed by a UUID the client has compiled in.',
    'minecraft:crafting_special_bannerduplicate': 'A multi recipe, keyed by a UUID the client has compiled in.',
    'minecraft:crafting_special_bookcloning': 'A multi recipe, keyed by a UUID the client has compiled in.',
    'minecraft:crafting_special_firework_rocket': 'A multi recipe, keyed by a UUID the client has compiled in.',
    'minecraft:crafting_special_firework_star': 'A multi recipe, keyed by a UUID the client has compiled in.',
    'minecraft:crafting_special_firework_star_fade': 'A multi recipe, keyed by a UUID the client has compiled in.',
    'minecraft:crafting_special_mapextending': 'A multi recipe, keyed by a UUID the client has compiled in.',
    'minecraft:crafting_special_repairitem': 'A multi recipe, keyed by a UUID the client has compiled in.',
    'minecraft:crafting_special_shielddecoration': 'A multi recipe, keyed by a UUID the client has compiled in.',
    'minecraft:crafting_transmute': 'Transmuting is a multi recipe, keyed by a UUID the client has compiled in.'
};

/** The eight lists, one per shape the packet carries. */
export interface CraftingDataPayload {
    readonly shaped: readonly ShapedRecipeEntry[];
    readonly shapeless: readonly ShapelessRecipeEntry[];
    readonly smithingTransform: readonly SmithingTransformEntry[];
    readonly smithingTrim: readonly SmithingTrimEntry[];
    readonly potionMixes: readonly PotionMixEntry[];
    /**
     * Cooking recipes. Protocol 2193 has no list for them - smelting became
     * client-side data - so a writer at that version drops this list and the
     * server smelts on its own. It is produced anyway because the recipes
     * exist and a later protocol may take them.
     */
    readonly furnace: readonly FurnaceRecipeEntry[];
}

/** What {@link buildCraftingData} produced, and everything it could not say on the wire. */
export interface CraftingDataResult extends CraftingDataPayload {
    readonly omitted: readonly OmittedRecipe[];
    readonly widened: readonly WidenedIngredient[];
}

/** Options for {@link buildCraftingData}. */
export interface CraftingDataOptions {
    /**
     * The numeric item ids a potion mix needs, since that one entry carries
     * numbers rather than names. Without it every brewing recipe is omitted.
     */
    items?: ItemIdLookup;
    /**
     * A Bedrock item tag that accepts exactly the given items, which is the
     * only way the wire expresses a slot taking any of several items.
     * Without it a multi-item slot is narrowed and reported.
     */
    bedrockTagFor?: (items: readonly string[]) => string | undefined;
    /**
     * The recipe's `priority`, which decides which of two matching recipes
     * wins. Java has no equivalent field, so it is 0 unless a caller knows
     * better.
     */
    priorityOf?: (recipe: CompiledRecipe) => number;
    /**
     * Whether a shaped recipe may be matched mirrored. Java's own shaped
     * matcher tries the mirror, so true is the faithful answer; it is off by
     * default because no vanilla Bedrock recipe file carries the field and
     * the flag's exact effect is unverified.
     */
    symmetric?: boolean;
}

const emptyIngredient: WireIngredient = { descriptor: null, count: 0 };

const resultOf = (reference: BedrockItemRef & { count: number }): WireResult => ({
    name: reference.identifier,
    // An output names the exact variant it produces, so an absent aux is 0
    // rather than "any".
    meta: reference.data ?? 0,
    count: reference.count
});

/**
 * Turns a compiled ingredient into the one descriptor a slot has room for.
 *
 * The wire takes a single item or a single Bedrock item tag; a compiled
 * ingredient is a set, because a Java tag expands into one. A caller that
 * can name a Bedrock tag covering the set keeps the whole set, and one that
 * cannot loses everything but the first item, which is reported.
 */
const ingredientOf = (
    ingredient: CompiledIngredient | null,
    recipeId: string,
    options: CraftingDataOptions,
    widened: WidenedIngredient[]
): WireIngredient => {
    const first = ingredient?.items[0];
    if (ingredient === null || first === undefined) return emptyIngredient;

    if (ingredient.items.length > 1) {
        const tag = options.bedrockTagFor?.(ingredient.items.map((item) => item.identifier));
        if (tag !== undefined) return { descriptor: { kind: 'tag', tag }, count: 1 };

        widened.push({
            recipeId,
            chosen: first.identifier,
            dropped: ingredient.items.slice(1).map((item) => item.identifier)
        });
    }

    return { descriptor: { kind: 'name', name: first.identifier, meta: first.data ?? ANY_META }, count: 1 };
};

/** The station tags a recipe's station maps to; campfire cooking has two. */
const stationTags = (recipe: CompiledRecipe): readonly string[] =>
    recipe.blockTags.length > 0 ? recipe.blockTags : BEDROCK_STATION_TAGS[recipe.station];

/**
 * Builds the recipe lists.
 *
 * @param recipes - Compiled recipes, as `compileRecipes` returned them, with
 *   the network ids it assigned.
 * @returns One list per wire array, plus the recipes with no Bedrock form
 *   and the ingredients that had to be narrowed.
 */
export const buildCraftingData = (
    recipes: Iterable<CompiledRecipe>,
    options: CraftingDataOptions = {}
): CraftingDataResult => {
    const shaped: ShapedRecipeEntry[] = [];
    const shapeless: ShapelessRecipeEntry[] = [];
    const smithingTransform: SmithingTransformEntry[] = [];
    const smithingTrim: SmithingTrimEntry[] = [];
    const potionMixes: PotionMixEntry[] = [];
    const furnace: FurnaceRecipeEntry[] = [];
    const omitted: OmittedRecipe[] = [];
    const widened: WidenedIngredient[] = [];

    for (const recipe of recipes) {
        const noForm = RECIPES_WITHOUT_A_BEDROCK_FORM[recipe.type];
        if (noForm !== undefined) {
            omitted.push({ recipeId: recipe.id, type: recipe.type, reason: noForm });
            continue;
        }

        const slot = (ingredient: CompiledIngredient | null): WireIngredient =>
            ingredientOf(ingredient, recipe.id, options, widened);
        const station = stationTags(recipe)[0] ?? recipe.station;
        const priority = options.priorityOf?.(recipe) ?? 0;
        const base = { id: recipe.id, netId: recipe.netId, station };
        const [first, second, third] = recipe.ingredients;

        // The one entry with no result: a trim writes a pattern onto the base.
        if (recipe.type === 'minecraft:smithing_trim') {
            smithingTrim.push({
                ...base,
                template: slot(first ?? null),
                base: slot(second ?? null),
                addition: slot(third ?? null)
            });
            continue;
        }

        const result = recipe.result;
        if (result === undefined) {
            omitted.push({
                recipeId: recipe.id,
                type: recipe.type,
                reason: 'The recipe compiled with no result, so there is nothing to tell the client to make.'
            });
            continue;
        }

        switch (recipe.type) {
            case 'minecraft:crafting_shaped': {
                const shape = recipe.shape;
                if (shape === undefined) {
                    omitted.push({
                        recipeId: recipe.id,
                        type: recipe.type,
                        reason: 'A shaped recipe with no shape; the client rejects a pattern that is not width by height.'
                    });
                    break;
                }

                shaped.push({
                    ...base,
                    width: shape.width,
                    height: shape.height,
                    pattern: recipe.ingredients.map(slot),
                    outputs: [resultOf(result)],
                    priority,
                    symmetric: options.symmetric ?? false
                });
                break;
            }

            case 'minecraft:crafting_shapeless':
            // A stonecutter recipe is a shapeless recipe whose station is the
            // stonecutter, which is how the vanilla Bedrock pack writes its
            // own 354 of them.
            case 'minecraft:stonecutting':
                shapeless.push({
                    ...base,
                    ingredients: recipe.ingredients.filter((item) => item !== null).map(slot),
                    outputs: [resultOf(result)],
                    priority
                });
                break;

            case 'minecraft:smithing_transform':
                smithingTransform.push({
                    ...base,
                    template: slot(first ?? null),
                    base: slot(second ?? null),
                    addition: slot(third ?? null),
                    output: resultOf(result)
                });
                break;

            case 'minecraft:brewing': {
                const inputItem = first?.items[0];
                const reagentItem = second?.items[0];
                const inputId = inputItem === undefined ? undefined : options.items?.(inputItem.identifier);
                const reagentId = reagentItem === undefined ? undefined : options.items?.(reagentItem.identifier);
                const outputId = options.items?.(result.identifier);

                if (inputId === undefined || reagentId === undefined || outputId === undefined) {
                    omitted.push({
                        recipeId: recipe.id,
                        type: recipe.type,
                        reason: 'A potion mix carries numeric item ids, and one of the three has no id.'
                    });
                    break;
                }

                potionMixes.push({
                    id: recipe.id,
                    netId: recipe.netId,
                    inputId,
                    inputMeta: inputItem?.data ?? 0,
                    reagentId,
                    reagentMeta: reagentItem?.data ?? 0,
                    outputId,
                    outputMeta: result.data ?? 0
                });
                break;
            }

            case 'minecraft:smelting':
            case 'minecraft:blasting':
            case 'minecraft:smoking':
            case 'minecraft:campfire_cooking':
                // One entry per station tag: campfire cooking is both the
                // campfire and the soul campfire, and the wire writes one
                // station string per entry.
                for (const tag of stationTags(recipe)) {
                    furnace.push({ ...base, station: tag, input: slot(first ?? null), output: resultOf(result) });
                }
                break;

            default:
                omitted.push({
                    recipeId: recipe.id,
                    type: recipe.type,
                    reason: 'No list of this packet takes a recipe of this type.'
                });
        }
    }

    return { shaped, shapeless, smithingTransform, smithingTrim, potionMixes, furnace, omitted, widened };
};
