/** A JSON object after `JSON.parse`, before this package has checked its members. */
export type JsonObject = Readonly<Record<string, unknown>>;

/** Narrows a parsed JSON value to an object. */
export const isJsonObject = (value: unknown): value is JsonObject =>
    typeof value === 'object' && value !== null && !Array.isArray(value);

/** Reads a member of a parsed JSON object, or undefined when the value is not an object. */
export const member = (value: unknown, key: string): unknown => (isJsonObject(value) ? value[key] : undefined);

/** Returns `value` when it is a string, otherwise undefined. */
export const asString = (value: unknown): string | undefined => (typeof value === 'string' ? value : undefined);

/** Returns `value` when it is a finite number, otherwise undefined. */
export const asNumber = (value: unknown): number | undefined =>
    typeof value === 'number' && Number.isFinite(value) ? value : undefined;

/** Returns `value` when it is a boolean, otherwise undefined. */
export const asBoolean = (value: unknown): boolean | undefined => (typeof value === 'boolean' ? value : undefined);

/** Wraps a single value in an array and leaves an array alone, which is how Java's list codecs read. */
export const asArray = (value: unknown): readonly unknown[] =>
    value === undefined ? [] : Array.isArray(value) ? value : [value];

/** Returns the elements of `value` when it is an array, and nothing otherwise. */
export const asList = (value: unknown): readonly unknown[] => (Array.isArray(value) ? value : []);

/**
 * Adds a member name to a diagnostic path, using bracket notation for array
 * indices so `terms` and `terms[0]` read the way the JSON does.
 */
export const joinPath = (path: string, segment: string | number): string =>
    typeof segment === 'number' ? `${path}[${segment}]` : path === '' ? segment : `${path}.${segment}`;

/**
 * Normalizes a Minecraft identifier to its namespaced form so `stone` and
 * `minecraft:stone` compare equal.
 */
export const namespaced = (id: string): string => (id.includes(':') ? id : `minecraft:${id}`);
