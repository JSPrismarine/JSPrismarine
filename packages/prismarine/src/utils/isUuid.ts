/** The `8-4-4-4-12` hex form of a UUID, in either case. */
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Whether a value is a string in the `8-4-4-4-12` hex form of a UUID. The version is not checked. */
export const isUuid = (value: unknown): value is string => typeof value === 'string' && UUID.test(value);
