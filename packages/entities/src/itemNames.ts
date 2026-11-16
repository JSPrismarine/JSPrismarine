/**
 * How a definition names an item: `bucket:1` with an auxiliary value, `carpet` by its
 * pre-flattening name, or an identifier with or without its `minecraft:` namespace. Filters and
 * the runtime's equippable slots read item names the same way through these.
 */
import { legacy_item_aliases, legacy_item_aux_aliases } from '@jsprismarine/bedrock-data';

/** Splits a `has_equipment` value such as `bucket:1` into its name and auxiliary value. */
export const splitItemValue = (value: unknown): { readonly name: string; readonly data?: number } | undefined => {
    if (typeof value !== 'string') return undefined;
    const match = /^(?<name>.*?)(?::(?<data>\d+))?$/.exec(value);
    if (match?.groups === undefined) return { name: value };
    return { name: match.groups.name!, data: match.groups.data === undefined ? undefined : Number(match.groups.data) };
};

/** Compares an item identifier with and without the `minecraft:` namespace. */
export const sameItemName = (identifier: string, name: string): boolean =>
    identifier === name || identifier === `minecraft:${name}` || `minecraft:${identifier}` === name;

/** An item identifier with the `minecraft:` namespace a bare name leaves out. */
const namespaced = (name: string): string => (name.includes(':') ? name : `minecraft:${name}`);

/**
 * Whether a held item is the one a `has_equipment` value names.
 *
 * Vanilla definitions still name some items by their pre-flattening identifier: the llama's
 * carpet interaction asks for `carpet`, which Bedrock now holds as sixteen `*_carpet` items. Bedrock's
 * own table maps such a name, with an auxiliary value to one item and without one to every item it
 * stood for.
 */
export const holdsNamedItem = (
    identifier: string,
    data: number | undefined,
    wanted: { readonly name: string; readonly data?: number | undefined }
): boolean => {
    if (sameItemName(identifier, wanted.name)) return wanted.data === undefined || data === wanted.data;
    const legacy = namespaced(wanted.name);
    const variants = legacy_item_aux_aliases[legacy];
    if (variants !== undefined) {
        const held = namespaced(identifier);
        return wanted.data === undefined
            ? Object.values(variants).includes(held)
            : variants[String(wanted.data)] === held;
    }
    const renamed = legacy_item_aliases[legacy];
    return renamed !== undefined && wanted.data === undefined && sameItemName(identifier, renamed);
};

/**
 * Whether an item matches a name as a definition writes it, such as `carpet`, `carpet:14` or
 * `minecraft:saddle`.
 * @param identifier - The item's identifier.
 * @param data - The item's auxiliary value, when it has one.
 * @param value - The name the definition wrote.
 */
export const itemMatchesName = (identifier: string, data: number | undefined, value: string): boolean => {
    const wanted = splitItemValue(value);
    return wanted !== undefined && holdsNamedItem(identifier, data, wanted);
};
