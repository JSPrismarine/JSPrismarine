import type { Ingredient } from './ingredient';
import type { IntRange, ItemStackTemplate } from './itemStack';

/**
 * Every recipe serializer Java 26.3 registers, read from
 * `net.minecraft.world.item.crafting.RecipeSerializers` in the 26.3 server
 * jar. Vanilla's 2042 recipe files use all 22.
 */
export const RECIPE_TYPES = [
    'minecraft:blasting',
    'minecraft:brewing',
    'minecraft:campfire_cooking',
    'minecraft:crafting_decorated_pot',
    'minecraft:crafting_dye',
    'minecraft:crafting_imbue',
    'minecraft:crafting_shaped',
    'minecraft:crafting_shapeless',
    'minecraft:crafting_special_bannerduplicate',
    'minecraft:crafting_special_bookcloning',
    'minecraft:crafting_special_firework_rocket',
    'minecraft:crafting_special_firework_star',
    'minecraft:crafting_special_firework_star_fade',
    'minecraft:crafting_special_mapextending',
    'minecraft:crafting_special_repairitem',
    'minecraft:crafting_special_shielddecoration',
    'minecraft:crafting_transmute',
    'minecraft:smelting',
    'minecraft:smithing_transform',
    'minecraft:smithing_trim',
    'minecraft:smoking',
    'minecraft:stonecutting'
] as const;

/** One of {@link RECIPE_TYPES}. */
export type RecipeType = (typeof RECIPE_TYPES)[number];

/**
 * The eight serializers whose logic lives in Java code rather than in the
 * recipe file. Their JSON names the ingredients; what the craft produces is
 * implemented here, in `special.ts`.
 */
export const SPECIAL_RECIPE_TYPES = RECIPE_TYPES.filter((type) => type.startsWith('minecraft:crafting_special_'));

/**
 * Java's eight `RecipeType` values, which is the station a recipe is matched
 * at. Several serializers share one station: the four cooking serializers
 * each have their own, while both smithing serializers share `smithing`.
 */
export const RECIPE_STATIONS = [
    'crafting',
    'smelting',
    'blasting',
    'smoking',
    'campfire_cooking',
    'stonecutting',
    'smithing',
    'brewing'
] as const;

/** One of {@link RECIPE_STATIONS}. */
export type RecipeStation = (typeof RECIPE_STATIONS)[number];

/** The station each serializer is matched at. */
export const STATION_BY_TYPE = {
    'minecraft:blasting': 'blasting',
    'minecraft:brewing': 'brewing',
    'minecraft:campfire_cooking': 'campfire_cooking',
    'minecraft:crafting_decorated_pot': 'crafting',
    'minecraft:crafting_dye': 'crafting',
    'minecraft:crafting_imbue': 'crafting',
    'minecraft:crafting_shaped': 'crafting',
    'minecraft:crafting_shapeless': 'crafting',
    'minecraft:crafting_special_bannerduplicate': 'crafting',
    'minecraft:crafting_special_bookcloning': 'crafting',
    'minecraft:crafting_special_firework_rocket': 'crafting',
    'minecraft:crafting_special_firework_star': 'crafting',
    'minecraft:crafting_special_firework_star_fade': 'crafting',
    'minecraft:crafting_special_mapextending': 'crafting',
    'minecraft:crafting_special_repairitem': 'crafting',
    'minecraft:crafting_special_shielddecoration': 'crafting',
    'minecraft:crafting_transmute': 'crafting',
    'minecraft:smelting': 'smelting',
    'minecraft:smithing_transform': 'smithing',
    'minecraft:smithing_trim': 'smithing',
    'minecraft:smoking': 'smoking',
    'minecraft:stonecutting': 'stonecutting'
} as const satisfies Record<RecipeType, RecipeStation>;

/** Fields every parsed recipe carries. */
interface RecipeBase {
    /** The recipe's identifier, which is its datapack file path without the extension. */
    readonly id: string;
    readonly type: RecipeType;
    readonly station: RecipeStation;
    /** The recipe book group, when the recipe declares one. */
    readonly group?: string;
    /** The recipe book category, when the recipe declares one. */
    readonly category?: string;
}

/** A shaped pattern laid out row by row, with `null` for an empty cell. */
export interface ShapedPattern {
    readonly width: number;
    readonly height: number;
    /** `width * height` cells in row-major order. */
    readonly cells: readonly (Ingredient | null)[];
}

/** `minecraft:crafting_shaped`: a pattern plus its key, matched with mirroring and offset placement. */
export interface ShapedRecipe extends RecipeBase {
    readonly type: 'minecraft:crafting_shaped';
    readonly pattern: ShapedPattern;
    readonly result: ItemStackTemplate;
    /** Whether the client pops a recipe book notification on unlock. One vanilla recipe sets this false. */
    readonly showNotification: boolean;
}

/** `minecraft:crafting_shapeless`: up to nine ingredients in any arrangement. */
export interface ShapelessRecipe extends RecipeBase {
    readonly type: 'minecraft:crafting_shapeless';
    readonly ingredients: readonly Ingredient[];
    readonly result: ItemStackTemplate;
}

/**
 * `minecraft:crafting_transmute`: one input keeps its components while its
 * identifier changes, consuming a counted material. Vanilla uses it for
 * shulker box and bundle dyeing and for map cloning.
 */
export interface TransmuteRecipe extends RecipeBase {
    readonly type: 'minecraft:crafting_transmute';
    readonly input: Ingredient;
    readonly material: Ingredient;
    /** How many material items the craft takes. Defaults to exactly 1; Java caps the field at 1 to 8. */
    readonly materialCount: IntRange;
    /** Whether the result count is the material count plus one, which is how map cloning scales. */
    readonly addMaterialCountToResult: boolean;
    readonly result: ItemStackTemplate;
}

/** `minecraft:crafting_dye`: one dyeable target plus one to eight dyes. */
export interface DyeRecipe extends RecipeBase {
    readonly type: 'minecraft:crafting_dye';
    readonly target: Ingredient;
    readonly dye: Ingredient;
    readonly result: ItemStackTemplate;
}

/** `minecraft:crafting_imbue`: eight materials around one source, which is how tipped arrows are made. */
export interface ImbueRecipe extends RecipeBase {
    readonly type: 'minecraft:crafting_imbue';
    readonly source: Ingredient;
    readonly material: Ingredient;
    readonly result: ItemStackTemplate;
}

/** `minecraft:crafting_decorated_pot`: four sherds or bricks at the four edge-center slots of a 3x3 grid. */
export interface DecoratedPotRecipe extends RecipeBase {
    readonly type: 'minecraft:crafting_decorated_pot';
    readonly back: Ingredient;
    readonly left: Ingredient;
    readonly right: Ingredient;
    readonly front: Ingredient;
    readonly result: ItemStackTemplate;
}

/** The four cooking serializers, which differ only in their station and their vanilla cooking times. */
export interface CookingRecipe extends RecipeBase {
    readonly type: 'minecraft:smelting' | 'minecraft:blasting' | 'minecraft:smoking' | 'minecraft:campfire_cooking';
    readonly ingredient: Ingredient;
    readonly result: ItemStackTemplate;
    /** Experience the station drops when the result is collected. */
    readonly experience: number;
    /** How many ticks the cook takes. */
    readonly cookingTime: number;
}

/** `minecraft:stonecutting`: one input, one result, selected by the player at the stonecutter. */
export interface StonecuttingRecipe extends RecipeBase {
    readonly type: 'minecraft:stonecutting';
    readonly ingredient: Ingredient;
    readonly result: ItemStackTemplate;
}

/** `minecraft:smithing_transform`: template plus base plus addition yields a named result. */
export interface SmithingTransformRecipe extends RecipeBase {
    readonly type: 'minecraft:smithing_transform';
    /** Absent when the recipe accepts any template slot content, including an empty one. */
    readonly template?: Ingredient;
    readonly base: Ingredient;
    readonly addition?: Ingredient;
    readonly result: ItemStackTemplate;
}

/** `minecraft:smithing_trim`: the base keeps its identity and gains an armor trim. */
export interface SmithingTrimRecipe extends RecipeBase {
    readonly type: 'minecraft:smithing_trim';
    readonly template?: Ingredient;
    readonly base: Ingredient;
    readonly addition?: Ingredient;
    /** The `minecraft:trim_pattern` identifier the craft writes onto the base. */
    readonly pattern: string;
}

/** `minecraft:brewing`: one reagent above three identical inputs in a brewing stand. */
export interface BrewingRecipe extends RecipeBase {
    readonly type: 'minecraft:brewing';
    readonly input: Ingredient;
    readonly reagent: Ingredient;
    readonly output: ItemStackTemplate;
}

/** `minecraft:crafting_special_bannerduplicate`: a patterned banner and a blank one of the same color. */
export interface BannerDuplicateRecipe extends RecipeBase {
    readonly type: 'minecraft:crafting_special_bannerduplicate';
    readonly banner: Ingredient;
    readonly result: ItemStackTemplate;
}

/** `minecraft:crafting_special_bookcloning`: one written book plus blank books, one copy each. */
export interface BookCloningRecipe extends RecipeBase {
    readonly type: 'minecraft:crafting_special_bookcloning';
    readonly source: Ingredient;
    readonly material: Ingredient;
    /** Which `generation` values of the source book may be copied. Defaults to 0 to 1; Java caps the field at 0 to 2. */
    readonly allowedGenerations: IntRange;
    readonly result: ItemStackTemplate;
}

/** `minecraft:crafting_special_firework_rocket`: one shell, one to three fuel, and up to seven stars. */
export interface FireworkRocketRecipe extends RecipeBase {
    readonly type: 'minecraft:crafting_special_firework_rocket';
    readonly shell: Ingredient;
    readonly fuel: Ingredient;
    readonly star: Ingredient;
    readonly result: ItemStackTemplate;
}

/** `minecraft:crafting_special_firework_star`: one fuel, one to eight dyes, and optional shape and effect modifiers. */
export interface FireworkStarRecipe extends RecipeBase {
    readonly type: 'minecraft:crafting_special_firework_star';
    readonly fuel: Ingredient;
    readonly dye: Ingredient;
    /** The item that selects each explosion shape, keyed by the shape name the result records. */
    readonly shapes: Readonly<Record<string, Ingredient>>;
    readonly trail: Ingredient;
    readonly twinkle: Ingredient;
    readonly result: ItemStackTemplate;
}

/** `minecraft:crafting_special_firework_star_fade`: one firework star plus one to eight dyes. */
export interface FireworkStarFadeRecipe extends RecipeBase {
    readonly type: 'minecraft:crafting_special_firework_star_fade';
    readonly target: Ingredient;
    readonly dye: Ingredient;
    readonly result: ItemStackTemplate;
}

/** `minecraft:crafting_special_mapextending`: a filled map centered in a 3x3 grid of paper. */
export interface MapExtendingRecipe extends RecipeBase {
    readonly type: 'minecraft:crafting_special_mapextending';
    readonly map: Ingredient;
    readonly material: Ingredient;
    readonly result: ItemStackTemplate;
}

/** `minecraft:crafting_special_repairitem`: two damaged copies of one item combine into a repaired one. */
export interface RepairItemRecipe extends RecipeBase {
    readonly type: 'minecraft:crafting_special_repairitem';
}

/** `minecraft:crafting_special_shielddecoration`: a shield takes the banner's base color and patterns. */
export interface ShieldDecorationRecipe extends RecipeBase {
    readonly type: 'minecraft:crafting_special_shielddecoration';
    readonly banner: Ingredient;
    readonly target: Ingredient;
    readonly result: ItemStackTemplate;
}

/** One parsed recipe of any of the 22 serializers. */
export type Recipe =
    | ShapedRecipe
    | ShapelessRecipe
    | TransmuteRecipe
    | DyeRecipe
    | ImbueRecipe
    | DecoratedPotRecipe
    | CookingRecipe
    | StonecuttingRecipe
    | SmithingTransformRecipe
    | SmithingTrimRecipe
    | BrewingRecipe
    | BannerDuplicateRecipe
    | BookCloningRecipe
    | FireworkRocketRecipe
    | FireworkStarRecipe
    | FireworkStarFadeRecipe
    | MapExtendingRecipe
    | RepairItemRecipe
    | ShieldDecorationRecipe;

/** The recipe variant a serializer name parses into. */
export type RecipeOfType<T extends RecipeType> = Extract<Recipe, { readonly type: T }>;

/**
 * Every ingredient a recipe declares, in the order the compile step and the
 * recipe book expose them. A shaped recipe yields its pattern cells in
 * row-major order, with `null` for an empty cell; every other recipe yields
 * its ingredient fields in the order the serializer declares them.
 */
export const recipeIngredients = (recipe: Recipe): readonly (Ingredient | null)[] => {
    switch (recipe.type) {
        case 'minecraft:crafting_shaped':
            return recipe.pattern.cells;
        case 'minecraft:crafting_shapeless':
            return recipe.ingredients;
        case 'minecraft:crafting_transmute':
            return [recipe.input, recipe.material];
        case 'minecraft:crafting_dye':
            return [recipe.target, recipe.dye];
        case 'minecraft:crafting_imbue':
            return [recipe.source, recipe.material];
        case 'minecraft:crafting_decorated_pot':
            return [recipe.back, recipe.left, recipe.right, recipe.front];
        case 'minecraft:smelting':
        case 'minecraft:blasting':
        case 'minecraft:smoking':
        case 'minecraft:campfire_cooking':
        case 'minecraft:stonecutting':
            return [recipe.ingredient];
        case 'minecraft:smithing_transform':
        case 'minecraft:smithing_trim':
            return [recipe.template ?? null, recipe.base, recipe.addition ?? null];
        case 'minecraft:brewing':
            return [recipe.input, recipe.reagent];
        case 'minecraft:crafting_special_bannerduplicate':
            return [recipe.banner];
        case 'minecraft:crafting_special_bookcloning':
            return [recipe.source, recipe.material];
        case 'minecraft:crafting_special_firework_rocket':
            return [recipe.shell, recipe.fuel, recipe.star];
        case 'minecraft:crafting_special_firework_star':
            return [recipe.fuel, recipe.dye, ...Object.values(recipe.shapes), recipe.trail, recipe.twinkle];
        case 'minecraft:crafting_special_firework_star_fade':
            return [recipe.target, recipe.dye];
        case 'minecraft:crafting_special_mapextending':
            return [recipe.map, recipe.material];
        case 'minecraft:crafting_special_repairitem':
            return [];
        case 'minecraft:crafting_special_shielddecoration':
            return [recipe.banner, recipe.target];
    }
};

/**
 * The result the recipe declares, or `undefined` when it has none to declare.
 * The repair recipe names no result at all, and map cloning and map extending
 * write `"result": {}` because the result is built from the input map.
 */
export const recipeResult = (recipe: Recipe): ItemStackTemplate | undefined => {
    switch (recipe.type) {
        case 'minecraft:crafting_special_repairitem':
            return undefined;
        case 'minecraft:smithing_trim':
            return undefined;
        case 'minecraft:brewing':
            return recipe.output;
        default:
            return recipe.result;
    }
};
