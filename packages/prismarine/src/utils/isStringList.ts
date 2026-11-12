/** Whether a parsed JSON value is a list of strings. */
export const isStringList = (value: unknown): value is string[] =>
    Array.isArray(value) && value.every((item) => typeof item === 'string');
