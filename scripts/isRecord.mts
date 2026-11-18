/** Whether `value` is a plain object, such as a parsed JSON object, rather than an array or a primitive. */
export const isRecord = (value: unknown): value is Record<string, unknown> =>
    typeof value === 'object' && value !== null && !Array.isArray(value);
