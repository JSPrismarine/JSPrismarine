/**
 * Reads a number from untyped data.
 * @param value - The value read from a definition, a component or saved data.
 * @param fallback - What to use when the value is not a number.
 * @returns The value when it is a number, otherwise `fallback`.
 */
export const numberOf = (value: unknown, fallback: number): number => (typeof value === 'number' ? value : fallback);
