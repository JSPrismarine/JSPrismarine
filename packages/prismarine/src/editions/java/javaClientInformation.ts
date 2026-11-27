/**
 * What the server does with a Java client's settings: the language a script reads as the player's
 * locale, and the view distance the server sends chunks within.
 */

/**
 * A Java language code as the locale a Bedrock login names, which is what a script reads: Java
 * writes the region in lower case, as in `en_us`, and Bedrock in upper case, as in `en_US`.
 * @param language - The language the client sent.
 * @returns The locale.
 */
export const javaLocaleOf = (language: string): string => {
    const split = language.indexOf('_');
    return split < 0 ? language : `${language.slice(0, split)}_${language.slice(split + 1).toUpperCase()}`;
};

/**
 * The view distance a Java client is sent chunks within: what it asked for, raised to 2, then
 * capped at the server's own.
 * @javaSource ChunkMap.getPlayerViewDistance
 * @param requested - The view distance in the client's options.
 * @param server - The server's view distance.
 * @returns The view distance.
 */
export const javaViewDistanceOf = (requested: number, server: number): number =>
    Math.min(Math.max(requested, 2), server);
