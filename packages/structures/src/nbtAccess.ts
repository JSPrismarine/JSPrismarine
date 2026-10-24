/**
 * Typed reads over `@jsprismarine/nbt`'s untyped tag tree. Every cast in the
 * package that crosses the parsed-NBT boundary lives here: the reader hands
 * back `Map<string, any>` children and `Set<unknown>` lists, so these helpers
 * narrow once and the rest of the package stays typed.
 */
import { NBTTagCompound, Types } from '@jsprismarine/nbt';

import { StructureFormatError } from './types';

/** Every numeric tag wrapper the reader produces for a whole or fractional number. */
type NumericTag = Types.ByteVal | Types.ShortVal | Types.NumberVal | Types.FloatVal | Types.DoubleVal;

const isNumeric = (value: unknown): value is NumericTag =>
    value instanceof Types.ByteVal ||
    value instanceof Types.ShortVal ||
    value instanceof Types.NumberVal ||
    value instanceof Types.FloatVal ||
    value instanceof Types.DoubleVal;

/** Returns the raw child tag under `key`, or `undefined` when the compound has no such key. */
export const childAt = (compound: NBTTagCompound, key: string): unknown => compound.children.get(key);

/** Returns a number-valued child, accepting any numeric tag width, or `undefined`. */
export const numberAt = (compound: NBTTagCompound, key: string): number | undefined => {
    const value = childAt(compound, key);
    return isNumeric(value) ? value.getValue() : undefined;
};

/** Returns a string-valued child, or `undefined` when absent or another type. */
export const stringAt = (compound: NBTTagCompound, key: string): string | undefined => {
    const value = childAt(compound, key);
    return value instanceof Types.StringVal ? value.getValue() : undefined;
};

/** Returns a compound child, or `undefined` when absent or another type. */
export const compoundAt = (compound: NBTTagCompound, key: string): NBTTagCompound | undefined => {
    const value = childAt(compound, key);
    return value instanceof NBTTagCompound ? value : undefined;
};

/** Returns a list child's entries in file order, or an empty array when absent. */
export const listAt = (compound: NBTTagCompound, key: string): readonly unknown[] => {
    const value = childAt(compound, key);
    return value instanceof Set ? [...value] : [];
};

/** Returns the compound entries of a list child, skipping entries of another type. */
export const compoundListAt = (compound: NBTTagCompound, key: string): NBTTagCompound[] =>
    listAt(compound, key).filter((entry): entry is NBTTagCompound => entry instanceof NBTTagCompound);

/** Returns the numeric entries of already-read list entries, skipping entries of another type. */
export const numbersOf = (entries: readonly unknown[]): number[] =>
    entries.filter(isNumeric).map((entry) => entry.getValue());

/** Returns the numeric entries of a list child, skipping entries of another type. */
export const numberListAt = (compound: NBTTagCompound, key: string): number[] => numbersOf(listAt(compound, key));

/**
 * Reads a three-number list, which both formats use for sizes and positions.
 *
 * @throws {StructureFormatError} When the key is missing or does not hold exactly three numbers.
 */
export const tripleAt = (compound: NBTTagCompound, key: string, context: string): [number, number, number] => {
    const values = numberListAt(compound, key);
    const [x, y, z] = values;
    if (values.length !== 3 || x === undefined || y === undefined || z === undefined) {
        throw new StructureFormatError(`${context}: expected ${key} to be three numbers, found ${values.length}`);
    }
    return [x, y, z];
};

/** Reads a compound of string values into a plain record, skipping non-string entries. */
export const stringRecord = (compound: NBTTagCompound | undefined): Record<string, string> => {
    const record: Record<string, string> = {};
    if (compound === undefined) return record;
    for (const [key, value] of compound.entries()) {
        if (value instanceof Types.StringVal) record[key] = value.getValue();
    }
    return record;
};

/**
 * Reads a compound of block state values, which Bedrock stores with the type
 * the state declares: strings, integers and bytes for booleans.
 */
export const stateRecord = (compound: NBTTagCompound | undefined): Record<string, string | number> => {
    const record: Record<string, string | number> = {};
    if (compound === undefined) return record;
    for (const [key, value] of compound.entries()) {
        if (value instanceof Types.StringVal) record[key] = value.getValue();
        else if (isNumeric(value)) record[key] = value.getValue();
    }
    return record;
};
