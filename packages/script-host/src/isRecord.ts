/** Whether a value is a non-null object, which is what parsed JSON has to be before its fields are read. */
export const isRecord = (value: unknown): value is Record<string, unknown> =>
    typeof value === 'object' && value !== null && !Array.isArray(value);
