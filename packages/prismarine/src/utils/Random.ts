/**
 * Where anything that rolls for something gets its chance from.
 *
 * `Math.random` is a global, and a global is the one thing a test cannot
 * vary. So chance travels as a value: the server holds one source, hands it
 * out, and a test hands out a scripted one instead.
 */

/** A source of chance: a number in `[0, 1)`, the way `Math.random` gives one. */
export type Random = () => number;

/**
 * The server's own source of chance, or the global one when it has none.
 *
 * Written against the one method it needs rather than against `Server`, so a
 * stand-in server in a test satisfies it without being one.
 *
 * @param server - The server the roll happened on.
 * @returns The source of chance.
 */
export const randomOf = (server: { getRandom?: () => Random } | null | undefined): Random =>
    server?.getRandom?.() ?? Math.random;
