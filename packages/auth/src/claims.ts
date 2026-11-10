/** A claim that is a non-empty string, or undefined. */
export const textClaim = (claims: Readonly<Record<string, unknown>>, name: string): string | undefined => {
    const value = claims[name];
    return typeof value === 'string' && value.length > 0 ? value : undefined;
};
