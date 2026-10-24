import type { CraftOutcome } from './assemble';
import { assignIngredients, buildResult, withComponents } from './assemble';
import type { RecipeContext } from './context';
import { EMPTY_CONTEXT } from './context';
import type { CraftingGrid, CroppedGrid } from './grid';
import { cropGrid } from './grid';
import type { Ingredient } from './ingredient';
import { ingredientAccepts } from './ingredient';
import type { RecipeItemStack } from './itemStack';
import { shapedPatternMatches } from './shaped';
import {
    matchBannerDuplicate,
    matchBookCloning,
    matchDecoratedPot,
    matchDye,
    matchFireworkRocket,
    matchFireworkStar,
    matchFireworkStarFade,
    matchImbue,
    matchMapExtending,
    matchRepairItem,
    matchShieldDecoration,
    matchTransmute
} from './special';
import type { Recipe, RecipeStation } from './types';

/** The stations whose input is one item slot. */
type SingleItemStation = Extract<
    RecipeStation,
    'smelting' | 'blasting' | 'smoking' | 'campfire_cooking' | 'stonecutting'
>;

/** What a player has placed at a station, ready to be matched against that station's recipes. */
export type RecipeInput =
    /** A crafting grid of the table's or the inventory's declared size. */
    | { readonly station: 'crafting'; readonly grid: CraftingGrid }
    /** A furnace, blast furnace, smoker, campfire or stonecutter input slot. */
    | { readonly station: SingleItemStation; readonly item: RecipeItemStack | null }
    /** The smithing table's three slots, in the order the player sees them. */
    | {
          readonly station: 'smithing';
          readonly template: RecipeItemStack | null;
          readonly base: RecipeItemStack | null;
          readonly addition: RecipeItemStack | null;
      }
    /** One brewing stand bottle slot and the reagent above it. */
    | { readonly station: 'brewing'; readonly input: RecipeItemStack | null; readonly reagent: RecipeItemStack | null };

/** A recipe that accepts an input, with everything the caller needs to apply the craft. */
export interface RecipeMatch {
    readonly recipe: Recipe;
    readonly result: RecipeItemStack;
    /**
     * How many items the craft takes from each input slot, in the input's own
     * slot order: the full crafting grid in row-major order, or the station's
     * slots in the order {@link RecipeInput} declares them.
     */
    readonly consumed: readonly number[];
    /**
     * What the craft puts back into each slot after the consumption above,
     * aligned with `consumed`. This is the bucket a milk bucket leaves, the
     * glass bottle honey leaves, or the source item a duplicating recipe
     * returns. `null` where the craft leaves nothing.
     */
    readonly remainder: readonly (RecipeItemStack | null)[];
    /** Experience the station drops, for the four cooking serializers. */
    readonly experience?: number;
    /** How many ticks the cook takes, for the four cooking serializers. */
    readonly cookingTime?: number;
}

/** The slots a station's input occupies, in the order {@link RecipeMatch} reports them. */
const stationSlots = (input: RecipeInput): readonly (RecipeItemStack | null)[] => {
    switch (input.station) {
        case 'crafting':
            return input.grid.slots;
        case 'smithing':
            return [input.template, input.base, input.addition];
        case 'brewing':
            return [input.input, input.reagent];
        default:
            return [input.item];
    }
};

/** Builds the per-slot consumption and remainder lists from the item-level crafting remainder table. */
const foldRemainders = (
    slots: readonly (RecipeItemStack | null)[],
    consumedSlots: readonly number[],
    overrides: ReadonlyMap<number, RecipeItemStack> | undefined,
    context: RecipeContext
): Pick<RecipeMatch, 'consumed' | 'remainder'> => {
    const consumes = new Set(consumedSlots);
    const consumed = slots.map((_, slot) => (consumes.has(slot) ? 1 : 0));
    const remainder = slots.map((stack, slot) => {
        const override = overrides?.get(slot);
        if (override !== undefined) return override;
        if (stack === null || !consumes.has(slot)) return null;
        const remaining = context.remainderOf?.(stack.id);
        return remaining === undefined ? null : { id: remaining, count: 1 };
    });
    return { consumed, remainder };
};

/** Tests an optional ingredient slot: an absent ingredient requires an empty slot, as Java's does. */
const slotAccepts = (ingredient: Ingredient | undefined, stack: RecipeItemStack | null): boolean =>
    ingredient === undefined ? stack === null : ingredientAccepts(ingredient, stack);

/** Matches the crafting-station recipes, each of which works on the cropped grid. */
const matchCrafting = (recipe: Recipe, grid: CroppedGrid, context: RecipeContext): CraftOutcome | undefined => {
    switch (recipe.type) {
        case 'minecraft:crafting_shaped': {
            if (!shapedPatternMatches(recipe.pattern, grid)) return undefined;
            const result = buildResult(recipe.result);
            return result === undefined ? undefined : { result };
        }
        case 'minecraft:crafting_shapeless': {
            if (grid.filled !== recipe.ingredients.length) return undefined;
            if (assignIngredients(recipe.ingredients, grid.slots) === undefined) return undefined;
            const result = buildResult(recipe.result);
            return result === undefined ? undefined : { result };
        }
        case 'minecraft:crafting_transmute':
            return matchTransmute(recipe, grid);
        case 'minecraft:crafting_dye':
            return matchDye(recipe, grid, context);
        case 'minecraft:crafting_imbue':
            return matchImbue(recipe, grid);
        case 'minecraft:crafting_decorated_pot':
            return matchDecoratedPot(recipe, grid);
        case 'minecraft:crafting_special_bannerduplicate':
            return matchBannerDuplicate(recipe, grid);
        case 'minecraft:crafting_special_bookcloning':
            return matchBookCloning(recipe, grid);
        case 'minecraft:crafting_special_firework_rocket':
            return matchFireworkRocket(recipe, grid);
        case 'minecraft:crafting_special_firework_star':
            return matchFireworkStar(recipe, grid, context);
        case 'minecraft:crafting_special_firework_star_fade':
            return matchFireworkStarFade(recipe, grid, context);
        case 'minecraft:crafting_special_mapextending':
            return matchMapExtending(recipe, grid);
        case 'minecraft:crafting_special_repairitem':
            return matchRepairItem(recipe, grid, context);
        case 'minecraft:crafting_special_shielddecoration':
            return matchShieldDecoration(recipe, grid);
        default:
            return undefined;
    }
};

/** Matches the stations whose input is a fixed set of named slots rather than a grid. */
const matchStation = (recipe: Recipe, input: RecipeInput): CraftOutcome | undefined => {
    switch (recipe.type) {
        case 'minecraft:smelting':
        case 'minecraft:blasting':
        case 'minecraft:smoking':
        case 'minecraft:campfire_cooking':
        case 'minecraft:stonecutting': {
            if (input.station === 'crafting' || input.station === 'smithing' || input.station === 'brewing')
                return undefined;
            if (!ingredientAccepts(recipe.ingredient, input.item)) return undefined;
            const result = buildResult(recipe.result);
            return result === undefined ? undefined : { result };
        }
        case 'minecraft:smithing_transform': {
            if (input.station !== 'smithing') return undefined;
            if (!slotAccepts(recipe.template, input.template)) return undefined;
            if (!ingredientAccepts(recipe.base, input.base)) return undefined;
            if (!slotAccepts(recipe.addition, input.addition)) return undefined;
            const result = buildResult(recipe.result, input.base ?? undefined);
            return result === undefined ? undefined : { result };
        }
        case 'minecraft:smithing_trim': {
            if (input.station !== 'smithing' || input.base === null) return undefined;
            if (!slotAccepts(recipe.template, input.template)) return undefined;
            if (!ingredientAccepts(recipe.base, input.base)) return undefined;
            if (!slotAccepts(recipe.addition, input.addition)) return undefined;
            const material = input.addition?.components?.['minecraft:provides_trim_material'];
            return {
                result: withComponents(
                    { ...input.base, count: 1 },
                    {
                        'minecraft:trim': {
                            pattern: recipe.pattern,
                            ...(material !== undefined ? { material } : {})
                        }
                    }
                )
            };
        }
        case 'minecraft:brewing': {
            if (input.station !== 'brewing') return undefined;
            if (!ingredientAccepts(recipe.input, input.input)) return undefined;
            if (!ingredientAccepts(recipe.reagent, input.reagent)) return undefined;
            const result = buildResult(recipe.output);
            return result === undefined ? undefined : { result };
        }
        default:
            return undefined;
    }
};

/**
 * Whether one recipe accepts one station input, and what it produces.
 *
 * A crafting grid is cropped to the bounding box of its filled slots first,
 * the way Java's `CraftingInput` is, so a recipe matches wherever in the
 * table the player placed its items. Shaped patterns are then tried at every
 * remaining offset and in both the written and the mirrored arrangement.
 *
 * @param context - Injected registry lookups; {@link RecipeContext} says what each one enables.
 * @returns The match, or `undefined` when the recipe does not accept the input.
 */
export const matchRecipe = (
    recipe: Recipe,
    input: RecipeInput,
    context: RecipeContext = EMPTY_CONTEXT
): RecipeMatch | undefined => {
    if (recipe.station !== input.station) return undefined;

    const cooking =
        recipe.type === 'minecraft:smelting' ||
        recipe.type === 'minecraft:blasting' ||
        recipe.type === 'minecraft:smoking' ||
        recipe.type === 'minecraft:campfire_cooking'
            ? { experience: recipe.experience, cookingTime: recipe.cookingTime }
            : {};

    if (input.station === 'crafting') {
        const grid = cropGrid(input.grid);
        if (grid.filled === 0) return undefined;
        const outcome = matchCrafting(recipe, grid, context);
        if (outcome === undefined) return undefined;

        const overrides = new Map<number, RecipeItemStack>();
        for (const [slot, stack] of outcome.remainders ?? []) {
            const source = grid.sourceSlots[slot];
            if (source !== undefined) overrides.set(source, stack);
        }
        const consumedSlots = grid.sourceSlots.filter((_, slot) => grid.slots[slot] !== null);
        return {
            recipe,
            result: outcome.result,
            ...foldRemainders(input.grid.slots, consumedSlots, overrides, context)
        };
    }

    const outcome = matchStation(recipe, input);
    if (outcome === undefined) return undefined;
    const slots = stationSlots(input);
    const consumedSlots = slots.flatMap((stack, slot) => (stack === null ? [] : [slot]));
    return {
        recipe,
        result: outcome.result,
        ...foldRemainders(slots, consumedSlots, outcome.remainders, context),
        ...cooking
    };
};
