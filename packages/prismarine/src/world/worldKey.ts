/**
 * The key a server files one world's per-world state under: its dimension, and its level unless
 * that is the default one.
 *
 * Both halves, because two `worlds.<name>` entries each have an Overworld. The entity runtime
 * holds the store whose change log carries its world's block writes, each world hears its own
 * ticks seal there and answers its own undos, and the content adapter holds the world's random
 * stream and cooldowns. Keyed by the dimension name alone, every level's Overworld shared one log,
 * one set of mobs and the other's block writes.
 *
 * The default level keeps the bare dimension, because the content packages address a world by its
 * dimension alone and mean that level, and because a replay of a one-level server records its
 * random streams under these keys.
 */

/** Separates the level from the dimension. A config key that names a folder cannot hold NUL. */
const SEPARATOR = '\u0000';

/**
 * The key one world's state is filed under: the bare dimension for the default level, and the
 * level's name, a separator and the dimension for any other, so two levels' Overworlds never
 * share a key and the default level's keys stay what they were.
 *
 * @param dimension - The namespaced dimension identifier, such as `minecraft:overworld`.
 * @param level - The level's name, or undefined for the default level.
 * @returns The key.
 */
export const worldKeyOf = (dimension: string, level: string | undefined): string =>
    level === undefined ? dimension : `${level}${SEPARATOR}${dimension}`;

/**
 * Reads a key back into the world it names.
 * @param key - A key {@link worldKeyOf} made.
 * @returns The dimension, and the level when it is not the default.
 */
export const worldOfKey = (key: string): { readonly dimension: string; readonly level: string | undefined } => {
    const at = key.indexOf(SEPARATOR);
    return at === -1 ? { dimension: key, level: undefined } : { dimension: key.slice(at + 1), level: key.slice(0, at) };
};
