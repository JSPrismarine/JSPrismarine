/**
 * Whether a parsed JSON value is an object, which excludes `null` and arrays.
 *
 * `src/sources.ts` keeps a private copy: plain Node loads it from these scripts, and `src/`
 * imports without file extensions, so it cannot import a sibling module.
 */
export const isRecord = (value: unknown): value is Record<string, unknown> =>
    typeof value === 'object' && value !== null && !Array.isArray(value);
