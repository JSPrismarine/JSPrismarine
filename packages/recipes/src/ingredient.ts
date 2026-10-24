import type { RecipeItemStack } from './itemStack';
import { normalizeIdentifier } from './itemStack';

/**
 * Resolves a Java tag to the identifiers it holds, without the leading `#`.
 * The evaluator asks for the `item` registry everywhere an ingredient appears
 * and for `potion` inside a potion component predicate. Return `undefined`
 * for a tag the server does not know; the caller turns that into a
 * diagnostic rather than an exception.
 */
export type TagLookup = (registry: string, tag: string) => readonly string[] | undefined;

/**
 * A predicate on one Java data component of a candidate stack. Java's
 * ingredient grammar carries these in the inline object form, which vanilla
 * 26.3 uses only for the 279 brewing recipes.
 */
export interface ComponentPredicate {
    /** The namespaced component identifier the predicate reads. */
    readonly component: string;
    /** The predicate body exactly as the recipe wrote it. */
    readonly value: unknown;
    /**
     * For `minecraft:potion_contents`, the `potions` field resolved through
     * the potion registry. Absent for every other component.
     */
    readonly potions?: readonly string[];
}

/**
 * One resolved recipe ingredient: the item identifiers it accepts plus any
 * component predicate a candidate stack has to satisfy.
 */
export interface Ingredient {
    /** Every accepted Java item identifier, in declaration order with duplicates removed. */
    readonly items: readonly string[];
    /** The item tags the ingredient was written as, in declaration order, without the leading `#`. */
    readonly tags: readonly string[];
    /** Component predicates every candidate stack has to satisfy. */
    readonly components: readonly ComponentPredicate[];
}

/** Why an ingredient failed to parse, or what it lost while parsing. */
export interface IngredientDiagnostic {
    readonly severity: 'error' | 'warning';
    /** Dotted path to the offending field inside the recipe JSON, such as `key.#`. */
    readonly path: string;
    readonly message: string;
}

/** What {@link parseIngredient} produced. */
export interface IngredientParseResult {
    /** The ingredient, absent when the form was not one the grammar accepts. */
    readonly ingredient?: Ingredient;
    readonly diagnostics: readonly IngredientDiagnostic[];
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
    typeof value === 'object' && value !== null && !Array.isArray(value);

/** Resolves a holder set written as an id, a `#tag`, or a list of either. */
const resolveHolderSet = (
    registry: string,
    value: unknown,
    path: string,
    tags: TagLookup | undefined,
    into: string[],
    diagnostics: IngredientDiagnostic[]
): void => {
    if (typeof value === 'string') {
        if (!value.startsWith('#')) {
            into.push(normalizeIdentifier(value));
            return;
        }
        const tag = normalizeIdentifier(value.slice(1));
        const members = tags?.(registry, tag);
        if (members === undefined) {
            diagnostics.push({
                severity: 'warning',
                path,
                message: `the ${registry} tag ${tag} resolved to nothing; the ingredient accepts no item from it`
            });
            return;
        }
        for (const member of members) into.push(normalizeIdentifier(member));
        return;
    }
    if (Array.isArray(value)) {
        if (value.length === 0) {
            diagnostics.push({ severity: 'error', path, message: 'an ingredient list has to hold at least one entry' });
            return;
        }
        value.forEach((entry, index) => {
            resolveHolderSet(registry, entry, `${path}[${index}]`, tags, into, diagnostics);
        });
        return;
    }
    diagnostics.push({
        severity: 'error',
        path,
        message: `expected an identifier, a #tag or a list of them, got ${Array.isArray(value) ? 'array' : typeof value}`
    });
};

/**
 * Parses one ingredient in any of the four forms Java 26.3 accepts: an item
 * identifier, a `#tag`, a list of either, or an inline object naming an
 * `item` plus component predicates.
 *
 * Tag members come from `tags`; an unresolved tag contributes no items and
 * raises a warning rather than throwing, because recipe files are untrusted
 * input.
 *
 * @param path - Dotted path to the field, used in diagnostics.
 */
export const parseIngredient = (value: unknown, path: string, tags?: TagLookup): IngredientParseResult => {
    const diagnostics: IngredientDiagnostic[] = [];
    const items: string[] = [];
    const tagNames: string[] = [];
    const components: ComponentPredicate[] = [];

    const collectTagNames = (node: unknown): void => {
        if (typeof node === 'string' && node.startsWith('#')) tagNames.push(normalizeIdentifier(node.slice(1)));
        else if (Array.isArray(node)) for (const entry of node) collectTagNames(entry);
    };

    if (isRecord(value)) {
        const { item, ...predicates } = value;
        if (item === undefined) {
            diagnostics.push({ severity: 'error', path, message: 'an inline ingredient has to name an `item`' });
            return { diagnostics };
        }
        collectTagNames(item);
        resolveHolderSet('item', item, `${path}.item`, tags, items, diagnostics);
        for (const [name, predicate] of Object.entries(predicates)) {
            const component = normalizeIdentifier(name);
            if (component === 'minecraft:potion_contents' && isRecord(predicate) && 'potions' in predicate) {
                const potions: string[] = [];
                resolveHolderSet('potion', predicate['potions'], `${path}.${name}.potions`, tags, potions, diagnostics);
                components.push({ component, value: predicate, potions });
                continue;
            }
            components.push({ component, value: predicate });
        }
    } else {
        collectTagNames(value);
        resolveHolderSet('item', value, path, tags, items, diagnostics);
    }

    if (diagnostics.some((diagnostic) => diagnostic.severity === 'error')) return { diagnostics };

    return {
        ingredient: { items: [...new Set(items)], tags: [...new Set(tagNames)], components },
        diagnostics
    };
};

/** Deep structural equality over the JSON value shapes a component can hold. */
const jsonEquals = (left: unknown, right: unknown): boolean => {
    if (left === right) return true;
    if (Array.isArray(left) && Array.isArray(right))
        return left.length === right.length && left.every((entry, index) => jsonEquals(entry, right[index]));
    if (isRecord(left) && isRecord(right)) {
        const keys = Object.keys(left);
        return keys.length === Object.keys(right).length && keys.every((key) => jsonEquals(left[key], right[key]));
    }
    return false;
};

/** Reads the potion a `minecraft:potion_contents` component names, in either its string or object form. */
const potionOf = (component: unknown): string | undefined => {
    if (typeof component === 'string') return normalizeIdentifier(component);
    if (isRecord(component) && typeof component['potion'] === 'string') return normalizeIdentifier(component['potion']);
    return undefined;
};

const predicateMatches = (predicate: ComponentPredicate, stack: RecipeItemStack): boolean => {
    const present = stack.components?.[predicate.component];
    if (predicate.potions !== undefined) {
        const potion = potionOf(present);
        return potion !== undefined && predicate.potions.includes(potion);
    }
    return jsonEquals(predicate.value, present);
};

/**
 * Accepted identifiers as a set, built once per ingredient. The largest
 * vanilla ingredient resolves 356 identifiers, and the crafting matcher tests
 * every recipe against every grid slot, so a linear scan would dominate.
 */
const acceptedItems = new WeakMap<Ingredient, ReadonlySet<string>>();

/**
 * Whether a stack satisfies the ingredient: its identifier is one the
 * ingredient accepts and every component predicate holds. Count is not
 * considered, because each ingredient consumes one item from its slot.
 */
export const ingredientAccepts = (ingredient: Ingredient, stack: RecipeItemStack | null): boolean => {
    if (stack === null || stack.count <= 0) return false;
    let accepted = acceptedItems.get(ingredient);
    if (accepted === undefined) {
        accepted = new Set(ingredient.items);
        acceptedItems.set(ingredient, accepted);
    }
    if (!accepted.has(stack.id)) return false;
    return ingredient.components.every((predicate) => predicateMatches(predicate, stack));
};

/** An ingredient that accepts nothing, which is what an unresolved tag leaves behind. */
export const isEmptyIngredient = (ingredient: Ingredient): boolean => ingredient.items.length === 0;
