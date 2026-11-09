/** Whether a parsed JSON value is an object, which excludes `null` and arrays. */
export const isRecord = (value: unknown): value is Record<string, unknown> =>
    typeof value === 'object' && value !== null && !Array.isArray(value);
