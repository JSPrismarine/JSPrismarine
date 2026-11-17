/**
 * Field readers shared by the datapack JSON parsers.
 *
 * Every reader takes the JSON-path of the value it checks and names it in the error, so a bad
 * datapack file fails as `<world_preset>.dimensions["minecraft:overworld"].generator.type: ...`
 * rather than as a bare type error.
 */

import { WorldgenErrors } from '@jsprismarine/errors/worldgen';

/** Reads a JSON object, rejecting arrays and null. */
export const asObject = (value: unknown, path: string): Record<string, unknown> => {
    if (typeof value !== 'object' || value === null || Array.isArray(value)) {
        throw new WorldgenErrors.ExpectedObject({ path, source: JSON.stringify(value) });
    }
    // A parsed JSON document is `unknown`; every field read from the result is checked.
    return value as Record<string, unknown>;
};

/** Reads a JSON array. */
export const asArray = (value: unknown, path: string): unknown[] => {
    if (!Array.isArray(value)) throw new WorldgenErrors.ExpectedArray({ path, value: JSON.stringify(value) });
    return value;
};

/** Reads a finite number. */
export const number = (value: unknown, path: string): number => {
    if (typeof value !== 'number' || !Number.isFinite(value)) {
        throw new WorldgenErrors.ExpectedFiniteNumber({ path, value: JSON.stringify(value) });
    }
    return value;
};

/** Reads an integer. */
export const integer = (value: unknown, path: string): number => {
    if (typeof value !== 'number' || !Number.isInteger(value)) {
        throw new WorldgenErrors.ExpectedInteger({ path, value: JSON.stringify(value) });
    }
    return value;
};

/** Reads a boolean. */
export const boolean = (value: unknown, path: string): boolean => {
    if (typeof value !== 'boolean') throw new WorldgenErrors.ExpectedBoolean({ path, value: JSON.stringify(value) });
    return value;
};

/** Reads a string. */
export const string = (value: unknown, path: string): string => {
    if (typeof value !== 'string') throw new WorldgenErrors.ExpectedString({ path, value: JSON.stringify(value) });
    return value;
};

/** Reads a field Java accepts as either one string or a list of strings. */
export const stringOrList = (value: unknown, path: string): string | readonly string[] =>
    typeof value === 'string' ? value : asArray(value, path).map((entry, index) => string(entry, `${path}[${index}]`));

/** Reads a field that may be absent, applying `fallback` when it is. */
export const optional = <T>(value: unknown, fallback: T, read: (value: unknown) => T): T =>
    value === undefined ? fallback : read(value);

/** Reads one of a closed set of string values. */
export const oneOf = <T extends string>(value: unknown, path: string, allowed: readonly T[]): T => {
    const text = string(value, path);
    const match = allowed.find((candidate) => candidate === text);
    if (match === undefined) {
        throw new WorldgenErrors.ExpectedOne({
            path,
            allowed: allowed.map((v) => JSON.stringify(v)).join(', '),
            text: JSON.stringify(text)
        });
    }
    return match;
};

/** Checks an integer against an inclusive range. */
export const inRange = (value: number, path: string, min: number, max: number): number => {
    if (value < min || value > max) throw new WorldgenErrors.NumberOutOfRange({ path, min, max, value });
    return value;
};
