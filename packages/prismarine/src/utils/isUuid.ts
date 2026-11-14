/**
 * The `8-4-4-4-12` hex form of a UUID, in either case, as a regular expression source. The
 * `server-uuid` `@pattern` in `JsonConfigTypes.ts` must be a literal, and a test holds it equal
 * to this.
 */
export const UUID_PATTERN = '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$';

const UUID = new RegExp(UUID_PATTERN);

/** Whether a value is a string in the `8-4-4-4-12` hex form of a UUID. The version is not checked. */
export const isUuid = (value: unknown): value is string => typeof value === 'string' && UUID.test(value);
