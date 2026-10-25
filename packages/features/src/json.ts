/**
 * The checked reads every parser in this package uses.
 *
 * Mojang's `worldgen/` JSON arrives as `unknown` from `JSON.parse` and is treated as untrusted
 * data. Nothing here falls back to a default when a field is wrong: a silently defaulted field
 * changes a world rather than failing a load, which is the failure mode this package exists to
 * avoid. Optional fields are read with an explicit fallback at the call site.
 */

/** Raises a parse error naming the JSON path that failed. */
export const fail = (path: string, message: string): never => {
    throw new TypeError(`${path}: ${message}`);
};

/** Reads a JSON object. */
export const asObject = (value: unknown, path: string): Record<string, unknown> => {
    if (typeof value !== 'object' || value === null || Array.isArray(value)) {
        return fail(path, `expected an object, got ${JSON.stringify(value)}`);
    }
    // A parsed JSON document is `unknown`; every field read out of this record is checked.
    return value as Record<string, unknown>;
};

/** Reads a JSON array. */
export const asArray = (value: unknown, path: string): unknown[] => {
    if (!Array.isArray(value)) return fail(path, `expected an array, got ${JSON.stringify(value)}`);
    return value;
};

/** Reads a finite number, with an optional fallback for a missing field. */
export const asNumber = (value: unknown, path: string, fallback?: number): number => {
    if (value === undefined && fallback !== undefined) return fallback;
    if (typeof value !== 'number' || !Number.isFinite(value)) {
        return fail(path, `expected a finite number, got ${JSON.stringify(value)}`);
    }
    return value;
};

/** Reads an integer, with an optional fallback for a missing field. */
export const asInteger = (value: unknown, path: string, fallback?: number): number => {
    const parsed = asNumber(value, path, fallback);
    if (!Number.isInteger(parsed)) return fail(path, `expected an integer, got ${parsed}`);
    return parsed;
};

/** Reads a boolean, with an optional fallback for a missing field. */
export const asBoolean = (value: unknown, path: string, fallback?: boolean): boolean => {
    if (value === undefined && fallback !== undefined) return fallback;
    if (typeof value !== 'boolean') return fail(path, `expected a boolean, got ${JSON.stringify(value)}`);
    return value;
};

/** Reads a string, with an optional fallback for a missing field. */
export const asString = (value: unknown, path: string, fallback?: string): string => {
    if (value === undefined && fallback !== undefined) return fallback;
    if (typeof value !== 'string') return fail(path, `expected a string, got ${JSON.stringify(value)}`);
    return value;
};

/** Reads a string that must be one of a known set, narrowing it to that union. */
export const asEnum = <T extends string>(value: unknown, allowed: readonly T[], path: string): T => {
    if (typeof value !== 'string' || !(allowed as readonly string[]).includes(value)) {
        return fail(path, `expected one of ${allowed.join(', ')}, got ${JSON.stringify(value)}`);
    }
    // The membership test above narrows the string to the union the caller declared.
    return value as T;
};
