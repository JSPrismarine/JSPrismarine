/**
 * Quotes a wire string for diagnostics, escaping terminal controls and line separators.
 * The decoded value is preserved; use this only when formatting diagnostic text.
 */
export const formatWireValue = (value: string): string =>
    JSON.stringify(value).replace(
        /[\u007f-\u009f\u2028\u2029]/g,
        (character) => `\\u${character.charCodeAt(0).toString(16).padStart(4, '0')}`
    );
