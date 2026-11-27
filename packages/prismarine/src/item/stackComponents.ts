/**
 * The Java data components a stack sets that no field of `Item` holds.
 *
 * A stack keeps its enchantments, name, lore, durability, contents and map in fields of their
 * own, because the server reads them. Everything else a recipe, a trade or a loot table writes,
 * such as an armor trim, a firework's explosions, a banner's patterns or a written book's pages,
 * is kept here as Java's JSON form, so the stack carries it to the player's inventory, to the
 * world record and back into the next recipe that reads it.
 */
import { isRecord } from '../utils/isRecord';

/** A stack's other Java components, by namespaced id, in Java's JSON form. */
export type StackComponents = Readonly<Record<string, unknown>>;

/**
 * Components a stack holds somewhere other than its bag.
 *
 * The first group are fields of `Item`, and the second are read off the item type, which
 * `Item.asPredicateStack` adds for the grammars that read them. `minecraft:aux_value` is the
 * trading package's name for the Bedrock aux value. A bag holding any of them would hold a
 * second copy that could disagree with the first.
 */
const HELD_ELSEWHERE: ReadonlySet<string> = new Set([
    'minecraft:enchantments',
    'minecraft:stored_enchantments',
    'minecraft:custom_name',
    'minecraft:lore',
    'minecraft:damage',
    'minecraft:container',
    'minecraft:map_id',
    'minecraft:can_place_on',
    'minecraft:can_break',
    'minecraft:max_damage',
    'minecraft:enchantable',
    'minecraft:repairable',
    'minecraft:dye',
    'minecraft:provides_trim_material',
    'minecraft:aux_value'
]);

/**
 * A component value as plain JSON, or undefined for one that has none.
 *
 * The loot and predicate grammars build some values as maps, and a map written to a record
 * with `JSON.stringify` comes back as an empty object.
 */
const jsonValue = (value: unknown): unknown => {
    if (value === undefined || typeof value === 'function' || typeof value === 'symbol') return undefined;
    if (typeof value === 'bigint') return Number(value);
    if (value instanceof Map) return jsonValue(Object.fromEntries(value));
    if (value instanceof Set) return jsonValue([...value]);
    if (Array.isArray(value)) return value.map((entry) => jsonValue(entry) ?? null);
    if (isRecord(value)) {
        const fields: Record<string, unknown> = {};
        for (const [key, entry] of Object.entries(value)) {
            const converted = jsonValue(entry);
            if (converted !== undefined) fields[key] = converted;
        }
        return fields;
    }
    return value;
};

/**
 * The components of `entries` a stack keeps in its bag: the ones it holds nowhere else, as JSON.
 *
 * @param entries - Component ids and values, such as a recipe result's `components` or a loot
 *   stack's map. An undefined value is left out.
 * @returns The bag, empty when nothing is left.
 */
export const stackComponentsOf = (
    entries: Iterable<readonly [string, unknown]> | Readonly<Record<string, unknown>> | undefined
): StackComponents => {
    if (entries === undefined) return {};
    const pairs = Symbol.iterator in entries ? [...entries] : Object.entries(entries);

    const bag: Record<string, unknown> = {};
    for (const [id, value] of pairs) {
        if (HELD_ELSEWHERE.has(id)) continue;
        const converted = jsonValue(value);
        if (converted !== undefined) bag[id] = converted;
    }
    return bag;
};

/** Whether a bag holds anything, which decides whether a record writes it at all. */
export const hasStackComponents = (bag: StackComponents | undefined): bag is StackComponents =>
    bag !== undefined && Object.keys(bag).length > 0;

/** A JSON value with every object's keys sorted, so two equal values print the same. */
const canonical = (value: unknown): unknown => {
    if (Array.isArray(value)) return value.map(canonical);
    if (!isRecord(value)) return value;
    return Object.fromEntries(
        Object.keys(value)
            .sort()
            .map((key) => [key, canonical(value[key])])
    );
};

/**
 * Whether two bags hold the same components with the same values, whatever order they were set
 * in, which is the component half of Java's `ItemStack.isSameItemSameComponents`.
 *
 * @javaSee ItemStack.isSameItemSameComponents
 */
export const sameStackComponents = (left: StackComponents | undefined, right: StackComponents | undefined): boolean =>
    JSON.stringify(canonical(left ?? {})) === JSON.stringify(canonical(right ?? {}));
