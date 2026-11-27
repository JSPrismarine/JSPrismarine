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
 * recipe". Nothing here renumbers them. A Java recipe that goes out as
 * several entries keeps its own id on the first and takes ids after the
 * last recipe's for the rest, and several Java recipes behind one entry
 * share the first one's; {@link CraftingDataResult.recipesByNetId} says
 * which Java recipes each id stands for.
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

/**
 * A shapeless crafting recipe, which is also how a stonecutter recipe and a cooking recipe
 * travel: the station tag says which block makes it.
 */
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

/**
 * A recipe the client holds the behavior of, named by the UUID the client has compiled in.
 *
 * Several Java recipes can stand behind one: Java has a banner duplicate recipe per color and
 * Bedrock one built-in recipe for all of them.
 */
export interface MultiRecipeEntry {
    /** The UUID, in its dashed text form. */
    readonly uuid: string;
    readonly netId: number;
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
 * The built-in recipe each Java serializer is on a Bedrock client, by the UUID the client knows
 * it by.
 *
 * Every UUID here is one the pinned Bedrock Dedicated Server sends in its `CraftingDataPacket`
 * (`packages/bedrock-data/src/jsp/v2225/wire/0x34.bin`) and holds as text in its binary. The
 * packet pairs a UUID with nothing but a net id, so which recipe each one is comes from the
 * names other Bedrock servers give them, such as PocketMine-MP's `MultiRecipe` constants. The
 * capture's other UUIDs are the cartography table's and the old banner pattern recipe, which no
 * Java crafting recipe is.
 */
export const MULTI_RECIPE_UUIDS: Partial<Record<RecipeType, string>> = {
    'minecraft:crafting_special_repairitem': '00000000-0000-0000-0000-000000000001',
    // Bedrock has one built-in fireworks recipe, which makes the stars and fades them as well
    // as the rockets.
    'minecraft:crafting_special_firework_rocket': '00000000-0000-0000-0000-000000000002',
    'minecraft:crafting_special_firework_star': '00000000-0000-0000-0000-000000000002',
    'minecraft:crafting_special_firework_star_fade': '00000000-0000-0000-0000-000000000002',
    'minecraft:crafting_special_mapextending': 'd392b075-4ba1-40ae-8789-af868d56f6ce',
    'minecraft:crafting_special_bookcloning': 'd1ca6b84-338e-4f2f-9c6b-76cc8b4bd98d',
    'minecraft:crafting_special_bannerduplicate': 'b5c5d105-75a2-4076-af2b-923ea2bf4bf0',
    'minecraft:crafting_decorated_pot': '685a742a-c42e-4a4e-88ea-5eb83fc98e5b'
};

/**
 * Map cloning's built-in recipe. Java writes map cloning as a `crafting_transmute` with no
 * result item of its own, since the copies are the input map, so it is told apart from the
 * other transmutes by that missing result rather than by its type.
 */
export const MAP_CLONING_UUID = '85939755-ba10-4d9d-a4cc-efb7a8e943c4';

/**
 * The one smithing trim entry the pinned Bedrock Dedicated Server sends, which stands for every
 * trim pattern: the client trims any template, armor piece and material its own tags name.
 * Java has a recipe per pattern, and all of them go out as this entry.
 */
export const SMITHING_TRIM_ENTRY = {
    id: 'minecraft:smithing_armor_trim',
    template: 'minecraft:trim_templates',
    base: 'minecraft:trimmable_armors',
    addition: 'minecraft:trim_materials'
} as const;

/**
 * Why each Java serializer with no Bedrock form has none.
 * @see https://github.com/JSPrismarine/JSPrismarine/issues/3690
 */
export const RECIPES_WITHOUT_A_BEDROCK_FORM: Partial<Record<RecipeType, string>> = {
    'minecraft:crafting_dye':
        'Bedrock dyes armor with a built-in recipe whose UUID is not yet paired with the captured ones.',
    'minecraft:crafting_imbue':
        'Bedrock writes a tipped arrow recipe per potion, which needs the potion to arrow data mapping.',
    'minecraft:crafting_special_shielddecoration':
        'Bedrock decorates a shield with a built-in recipe whose UUID is not yet paired with the captured ones.'
};

/** The lists, one per shape the packet carries. */
export interface CraftingDataPayload {
    readonly shaped: readonly ShapedRecipeEntry[];
    readonly shapeless: readonly ShapelessRecipeEntry[];
    readonly multi: readonly MultiRecipeEntry[];
    /**
     * Shapeless recipes whose output keeps the input's user data, which is how a shulker box
     * keeps its contents when it is dyed. A Java `crafting_transmute` goes out as one of these
     * per item its input accepts, as the Bedrock Dedicated Server writes its own.
     */
    readonly userDataShapeless: readonly ShapelessRecipeEntry[];
    readonly smithingTransform: readonly SmithingTransformEntry[];
    readonly smithingTrim: readonly SmithingTrimEntry[];
    readonly potionMixes: readonly PotionMixEntry[];
}

/** What {@link buildCraftingData} produced, and everything it could not say on the wire. */
export interface CraftingDataResult extends CraftingDataPayload {
    /**
     * The Java recipes behind each net id a crafting or smithing entry carries, which is what a
     * client names when it crafts. Most ids stand for one recipe; a multi or trim entry stands
     * for every Java recipe it covers.
     */
    readonly recipesByNetId: ReadonlyMap<number, readonly string[]>;
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

/**
 * A cooking recipe's inputs as the wire's single slot can carry them: one name per item, each
 * with the suffix its entry's id takes past the first. The Bedrock Dedicated Server writes a
 * recipe per item too (`furnace_chainmail_boots` and the rest), and names sand and red sand one
 * by one rather than by a tag, so narrowing the input to its first item, or to a tag the client
 * may not hold, would hide items from the client's furnace.
 */
const cookingInputs = (
    ingredient: CompiledIngredient | null
): readonly { readonly input: WireIngredient; readonly suffix: string }[] => {
    const items = ingredient?.items ?? [];
    if (items.length === 0) return [{ input: emptyIngredient, suffix: '' }];

    return items.map((item) => ({
        input: { descriptor: { kind: 'name', name: item.identifier, meta: item.data ?? ANY_META }, count: 1 },
        suffix: `_from_${item.identifier.replace(/^.*:/, '')}${item.data === undefined ? '' : `_${item.data}`}`
    }));
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
    const all = [...recipes];
    const shaped: ShapedRecipeEntry[] = [];
    const shapeless: ShapelessRecipeEntry[] = [];
    const userDataShapeless: ShapelessRecipeEntry[] = [];
    const smithingTransform: SmithingTransformEntry[] = [];
    const smithingTrim: SmithingTrimEntry[] = [];
    const potionMixes: PotionMixEntry[] = [];
    const omitted: OmittedRecipe[] = [];
    const widened: WidenedIngredient[] = [];
    const recipesByNetId = new Map<number, string[]>();
    const multiByUuid = new Map<string, number>();

    // Ids for the entries past a recipe's first, after every id the recipes already hold.
    let nextNetId = all.reduce((highest, recipe) => Math.max(highest, recipe.netId), 0) + 1;
    const stands = (netId: number, recipeId: string): void => {
        const ids = recipesByNetId.get(netId);
        if (ids === undefined) recipesByNetId.set(netId, [recipeId]);
        else ids.push(recipeId);
    };

    for (const recipe of all) {
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

        const uuid =
            recipe.type === 'minecraft:crafting_transmute' && recipe.result === undefined
                ? MAP_CLONING_UUID
                : MULTI_RECIPE_UUIDS[recipe.type];
        if (uuid !== undefined) {
            // Recipes arrive in net id order, so the first one sets the entry's id.
            const netId = multiByUuid.get(uuid) ?? recipe.netId;
            multiByUuid.set(uuid, netId);
            stands(netId, recipe.id);
            continue;
        }

        // The one entry with no result: a trim writes a pattern onto the base.
        if (recipe.type === 'minecraft:smithing_trim') {
            const netId = smithingTrim[0]?.netId ?? recipe.netId;
            if (smithingTrim.length === 0) {
                const tag = (name: string): WireIngredient => ({ descriptor: { kind: 'tag', tag: name }, count: 1 });
                smithingTrim.push({
                    ...base,
                    id: SMITHING_TRIM_ENTRY.id,
                    template: tag(SMITHING_TRIM_ENTRY.template),
                    base: tag(SMITHING_TRIM_ENTRY.base),
                    addition: tag(SMITHING_TRIM_ENTRY.addition)
                });
            }
            stands(netId, recipe.id);
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

                stands(recipe.netId, recipe.id);
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
                stands(recipe.netId, recipe.id);
                shapeless.push({
                    ...base,
                    ingredients: recipe.ingredients.filter((item) => item !== null).map(slot),
                    outputs: [resultOf(result)],
                    priority
                });
                break;

            case 'minecraft:crafting_transmute': {
                // One entry per item the input accepts, since the wire's single slot would
                // otherwise narrow a tag of shulker boxes to one of them. An input that is
                // already the result is left out, as the Bedrock Dedicated Server leaves it.
                const inputs = (first?.items ?? []).filter(
                    (item) => item.identifier !== result.identifier || (item.data ?? 0) !== (result.data ?? 0)
                );
                const material = slot(second ?? null);
                for (const [index, item] of inputs.entries()) {
                    const netId = index === 0 ? recipe.netId : nextNetId++;
                    stands(netId, recipe.id);
                    userDataShapeless.push({
                        ...base,
                        id: index === 0 ? recipe.id : `${recipe.id}_from_${item.identifier.replace(/^.*:/, '')}`,
                        netId,
                        ingredients: [
                            {
                                descriptor: { kind: 'name', name: item.identifier, meta: item.data ?? ANY_META },
                                count: 1
                            },
                            material
                        ],
                        outputs: [resultOf(result)],
                        priority
                    });
                }
                break;
            }

            case 'minecraft:smithing_transform':
                stands(recipe.netId, recipe.id);
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
            case 'minecraft:campfire_cooking': {
                // A shapeless entry of one ingredient for each station tag and input, as the
                // Bedrock Dedicated Server writes its own cooking recipes: campfire cooking is
                // both the campfire and the soul campfire, and an entry carries one station. The
                // client reads these to know what a furnace's input slot takes, which is where a
                // shift-click puts a stack. A furnace makes them itself, so no net id is a
                // recipe a client can name in a craft.
                //
                // Each entry has an id of its own, since the client keys its recipe book on the
                // id and the wire derives the entry's UUID from it: the first keeps the recipe's
                // id, and the rest add the station past the first and the input past the first.
                const inputs = cookingInputs(first ?? null);
                const ids = new Set<string>();
                for (const [tagIndex, tag] of stationTags(recipe).entries()) {
                    for (const [inputIndex, { input, suffix }] of inputs.entries()) {
                        let id = `${recipe.id}${tagIndex === 0 ? '' : `_${tag}`}${inputIndex === 0 ? '' : suffix}`;
                        if (ids.has(id)) id = `${id}_${inputIndex}`;
                        ids.add(id);
                        shapeless.push({
                            ...base,
                            id,
                            netId: ids.size === 1 ? recipe.netId : nextNetId++,
                            station: tag,
                            ingredients: [input],
                            outputs: [resultOf(result)],
                            priority
                        });
                    }
                }
                break;
            }

            default:
                omitted.push({
                    recipeId: recipe.id,
                    type: recipe.type,
                    reason: 'No list of this packet takes a recipe of this type.'
                });
        }
    }

    return {
        shaped,
        shapeless,
        multi: [...multiByUuid].map(([uuid, netId]) => ({ uuid, netId })),
        userDataShapeless,
        smithingTransform,
        smithingTrim,
        potionMixes,
        recipesByNetId,
        omitted,
        widened
    };
};
