/** Java's four-second fuse for a primed TNT entity. */
export const DEFAULT_FUSE_TICKS = 80;

/**
 * Java's short fuse for TNT caught by an explosion.
 *
 * @param fuse - The fuse the entity would otherwise have had.
 * @param random - A draw in `[0, 1)`.
 * @returns The shortened fuse, in ticks.
 */
export const randomShortFuse = (fuse: number = DEFAULT_FUSE_TICKS, random: number = Math.random()): number =>
    Math.floor(random * Math.max(1, Math.floor(fuse / 4))) + Math.floor(fuse / 8);
