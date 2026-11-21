/** A count and its noun, such as `1 addon` or `3 addons`, with the plural given when it is not the noun plus `s`. */
export const plural = (count: number, one: string, many = `${one}s`): string => `${count} ${count === 1 ? one : many}`;
