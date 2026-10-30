/**
 * Field readers shared by the dimension parsers.
 *
 * Every reader takes the JSON-path of the value it checks and names it in the error, so a bad
 * datapack file fails as `<world_preset>.dimensions["minecraft:overworld"].generator.type: ...`
 * rather than as a bare type error.
 */

/** Reads a JSON object, rejecting arrays and null. */
export const asObject = (value: unknown, path: string): Record<string, unknown> => {
    if (typeof value !== 'object' || value === null || Array.isArray(value)) {
        throw new TypeError(`${path}: expected an object, got ${JSON.stringify(value)}`);
    }
    // A parsed JSON document is `unknown`; every field read from the result is checked.
    return value as Record<string, unknown>;
};

/** Reads a JSON array. */
export const asArray = (value: unknown, path: string): unknown[] => {
    if (!Array.isArray(value)) throw new TypeError(`${path}: expected an array, got ${JSON.stringify(value)}`);
    return value;
};

/** Reads a finite number. */
export const number = (value: unknown, path: string): number => {
    if (typeof value !== 'number' || !Number.isFinite(value)) {
        throw new TypeError(`${path}: expected a finite number, got ${JSON.stringify(value)}`);
    }
    return value;
};

/** Reads an integer. */
export const integer = (value: unknown, path: string): number => {
    if (typeof value !== 'number' || !Number.isInteger(value)) {
        throw new TypeError(`${path}: expected an integer, got ${JSON.stringify(value)}`);
    }
    return value;
};

/** Reads a boolean. */
export const boolean = (value: unknown, path: string): boolean => {
    if (typeof value !== 'boolean') throw new TypeError(`${path}: expected a boolean, got ${JSON.stringify(value)}`);
    return value;
};

/** Reads a string. */
export const string = (value: unknown, path: string): string => {
    if (typeof value !== 'string') throw new TypeError(`${path}: expected a string, got ${JSON.stringify(value)}`);
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
        throw new TypeError(
            `${path}: expected one of ${allowed.map((v) => JSON.stringify(v)).join(', ')}, got ${JSON.stringify(text)}`
        );
    }
    return match;
};

/** Checks an integer against an inclusive range. */
export const inRange = (value: number, path: string, min: number, max: number): number => {
    if (value < min || value > max) throw new RangeError(`${path} has to be between ${min} and ${max}, got ${value}`);
    return value;
};
