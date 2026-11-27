import { itemTypesTable } from '@jsprismarine/items';

/**
 * Resolves a Bedrock item identifier and legacy data value to the Java item a recipe names.
 *
 * `data` on a uniquely named Bedrock item is its legacy wire value, not a selector: birch planks
 * remain birch planks even when the stack's metadata is zero. Only an identifier several Java
 * items share needs the value to pick one of them. An identifier outside the `minecraft`
 * namespace is custom content and is its own Java identifier.
 *
 * @returns The Java identifier, or undefined for a vanilla item, or a variant of one, that no
 *   Java item matches.
 */
export const javaItemIdOf = (identifier: string, meta = 0): string | undefined => {
    const row = itemTypesTable.items[identifier];
    if (row === undefined) return identifier.startsWith('minecraft:') ? undefined : identifier;

    const merged = row.merged?.find((variant) => variant.data === meta);
    if (merged !== undefined) return merged.java;
    if (row.merged !== undefined && row.data !== undefined && row.data !== meta) return undefined;
    if (row.merged !== undefined && row.data === undefined && meta !== 0) return undefined;

    return row.java;
};

/**
 * Every Java item a Bedrock identifier stands for whatever its data value, which is what a
 * recipe ingredient that names no data value accepts.
 */
export const javaItemIdsOf = (identifier: string): readonly string[] => {
    const row = itemTypesTable.items[identifier];
    if (row === undefined) return identifier.startsWith('minecraft:') ? [] : [identifier];
    return [...new Set([row.java, ...(row.merged ?? []).map((variant) => variant.java)])];
};
