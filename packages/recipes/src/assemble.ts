import type { CroppedGrid } from './grid';
import type { Ingredient } from './ingredient';
import { ingredientAccepts } from './ingredient';
import type { ItemStackTemplate, RecipeItemStack } from './itemStack';

/** What one recipe produced from one input, before remainders are folded in. */
export interface CraftOutcome {
    readonly result: RecipeItemStack;
    /**
     * Stacks the craft puts back, keyed by slot index in the cropped grid.
     * These override the item's own crafting remainder, which is how banner
     * duplication and book cloning return their source item.
     */
    readonly remainders?: ReadonlyMap<number, RecipeItemStack>;
}

/** Merges two component maps, with `override` winning, and drops the key when both are empty. */
export const mergeComponents = (
    base: Readonly<Record<string, unknown>> | undefined,
    override: Readonly<Record<string, unknown>> | undefined
): Readonly<Record<string, unknown>> | undefined => {
    if (base === undefined) return override;
    if (override === undefined) return base;
    return { ...base, ...override };
};

/** Returns a copy of the stack with the named components set, dropping each entry whose value is `undefined`. */
export const withComponents = (
    stack: RecipeItemStack,
    components: Readonly<Record<string, unknown>>
): RecipeItemStack => {
    const merged: Record<string, unknown> = { ...stack.components };
    for (const [name, value] of Object.entries(components)) {
        if (value === undefined) delete merged[name];
        else merged[name] = value;
    }
    return { id: stack.id, count: stack.count, ...(Object.keys(merged).length > 0 ? { components: merged } : {}) };
};

/**
 * Builds the result stack a template declares. `fallback` supplies the
 * identifier and the components for a template that names neither, which is
 * how `crafting_transmute` and the map recipes carry an input stack's
 * identity into their result.
 *
 * This is Java's `TransmuteRecipe.createWithOriginalComponents`.
 */
export const buildResult = (
    template: ItemStackTemplate,
    fallback?: RecipeItemStack,
    count = template.count
): RecipeItemStack | undefined => {
    const id = template.id ?? fallback?.id;
    if (id === undefined) return undefined;
    const components = mergeComponents(fallback?.components, template.components);
    return { id, count, ...(components !== undefined ? { components } : {}) };
};

/** Reads one component off a stack, accepting the bare and the `minecraft:` prefixed name. */
export const componentOf = (stack: RecipeItemStack, name: string): unknown => stack.components?.[name];

/**
 * Finds an assignment of every ingredient to a distinct stack, which is what
 * a shapeless recipe needs: the player may place the items in any slot and
 * two ingredients may accept overlapping item sets.
 *
 * @returns For each ingredient, the index of the stack it takes, or `undefined` when no complete assignment exists.
 */
export const assignIngredients = (
    ingredients: readonly Ingredient[],
    stacks: readonly (RecipeItemStack | null)[]
): readonly number[] | undefined => {
    const takenBy = new Array<number>(stacks.length).fill(-1);

    const augment = (ingredient: number, visited: boolean[]): boolean => {
        for (let slot = 0; slot < stacks.length; slot++) {
            if (visited[slot] === true) continue;
            const candidate = ingredients[ingredient];
            if (candidate === undefined || !ingredientAccepts(candidate, stacks[slot] ?? null)) continue;
            visited[slot] = true;
            const holder = takenBy[slot];
            if (holder === undefined || holder === -1 || augment(holder, visited)) {
                takenBy[slot] = ingredient;
                return true;
            }
        }
        return false;
    };

    for (let ingredient = 0; ingredient < ingredients.length; ingredient++)
        if (!augment(ingredient, new Array<boolean>(stacks.length).fill(false))) return undefined;

    const assignment = new Array<number>(ingredients.length).fill(-1);
    takenBy.forEach((ingredient, slot) => {
        if (ingredient !== -1) assignment[ingredient] = slot;
    });
    return assignment;
};

/** One part a custom recipe splits its crafting grid into. */
export interface SlotRole {
    /** What the role accepts. A role with no ingredient accepts nothing and stays empty. */
    readonly ingredient?: Ingredient;
    /** How many slots the role takes before later roles get a turn. Unlimited when omitted. */
    readonly max?: number;
}

/**
 * Splits the filled slots of a cropped grid between roles, offering each slot
 * to the roles in order and stopping at the first one that accepts it and
 * still has room. Java's custom recipes classify their inputs exactly this
 * way, so the role order and the caps here have to match the order the Java
 * class tests in.
 *
 * @returns The slot indices each role collected, or `undefined` when a filled slot fits no role.
 */
export const classifySlots = (
    grid: CroppedGrid,
    roles: readonly SlotRole[]
): readonly (readonly number[])[] | undefined => {
    const collected: number[][] = roles.map(() => []);
    for (let slot = 0; slot < grid.slots.length; slot++) {
        const stack = grid.slots[slot];
        if (stack === null || stack === undefined) continue;
        const role = roles.findIndex(({ ingredient, max }, index) => {
            if (ingredient === undefined || !ingredientAccepts(ingredient, stack)) return false;
            return max === undefined || (collected[index]?.length ?? 0) < max;
        });
        if (role === -1) return undefined;
        collected[role]?.push(slot);
    }
    return collected;
};
