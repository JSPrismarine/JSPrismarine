/**
 * One item stack as the recipe evaluator sees it: a Java identifier, a count,
 * and the Java data components that the recipe grammar reads or writes.
 * Components the evaluator never touches travel through untouched.
 */
export interface RecipeItemStack {
    /** The namespaced Java item identifier. */
    readonly id: string;
    /** How many items the stack holds. A stack in a crafting slot always holds at least one. */
    readonly count: number;
    /** Java data components keyed by their namespaced identifier. */
    readonly components?: Readonly<Record<string, unknown>>;
}

/**
 * An item stack as a recipe declares it. `id` is absent on the two vanilla
 * recipes whose result is derived from an input stack rather than named,
 * `map_cloning` and `map_extending`.
 */
export interface ItemStackTemplate {
    /** The namespaced Java item identifier, absent when the result comes from an input stack. */
    readonly id?: string;
    /** How many items the result holds. Defaults to 1 when the recipe omits `count`. */
    readonly count: number;
    /** Java data components the recipe sets on the result. */
    readonly components?: Readonly<Record<string, unknown>>;
}

/** An inclusive integer range, Java's `MinMaxBounds.Ints` with both bounds present. */
export interface IntRange {
    readonly min: number;
    readonly max: number;
}

/** Whether `value` falls inside the inclusive range. */
export const rangeContains = (range: IntRange, value: number): boolean => value >= range.min && value <= range.max;

/** Builds a stack from a template, keeping the template's count and components. */
export const stackFromTemplate = (
    template: ItemStackTemplate,
    id: string,
    count = template.count
): RecipeItemStack => ({
    id,
    count,
    ...(template.components !== undefined ? { components: template.components } : {})
});

/**
 * Prefixes a bare identifier with `minecraft:`. Java accepts both forms
 * everywhere an identifier appears, and vanilla recipe files use the prefixed
 * form throughout.
 */
export const normalizeIdentifier = (id: string): string => (id.includes(':') ? id : `minecraft:${id}`);
