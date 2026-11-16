/** Whether a parsed JSON value is an object whose fields can be read by name. */
export const isRecord = (value: unknown): value is Record<string, unknown> =>
    typeof value === 'object' && value !== null;
