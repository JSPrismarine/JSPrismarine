/**
 * How much enchanting power stands around a table.
 *
 * Java's `EnchantmentMenu.slotsChanged`, which is fussier than "count the
 * bookshelves within two blocks". It walks the eight horizontal neighbors of
 * the table; for each one where *both* the block beside the table and the
 * block above it are empty, it counts the shelf two out in that direction at
 * both heights, and for the four diagonals the two intermediate positions as
 * well. That is the rule that makes a shelf stop counting when something is
 * put in the gap, which is the whole reason players build the ring with a gap.
 *
 * Fifteen is the most that can be reached and the most that matters; the draw
 * clamps there.
 */

/** The most power a table can draw on, which is also the most the formula uses. */
export const MAX_BOOKSHELF_POWER = 15;

/** What one block contributes. Java reads `enchantPowerBonus`; only the shelf has one. */
const POWER_BY_BLOCK: Readonly<Record<string, number>> = {
    'minecraft:bookshelf': 1
};

/** The blocks that count as an empty gap. A gap holding anything at all blocks the shelf. */
const EMPTY: ReadonlySet<string> = new Set(['minecraft:air', 'minecraft:cave_air', 'minecraft:void_air']);

/** The little of a world this reads, so a test satisfies it without one. */
export interface BookshelfWorld {
    getBlockState(x: number, y: number, z: number): Promise<{ readonly name: string }>;
}

/** Where the table stands. */
export interface BlockPosition {
    readonly x: number;
    readonly y: number;
    readonly z: number;
}

/**
 * The enchanting power around one table.
 *
 * @returns 0 to {@link MAX_BOOKSHELF_POWER}.
 */
export const bookshelfPowerAround = async (world: BookshelfWorld, at: BlockPosition): Promise<number> => {
    const powerAt = async (dx: number, dy: number, dz: number): Promise<number> =>
        POWER_BY_BLOCK[(await world.getBlockState(at.x + dx, at.y + dy, at.z + dz)).name] ?? 0;

    const isEmpty = async (dx: number, dy: number, dz: number): Promise<boolean> =>
        EMPTY.has((await world.getBlockState(at.x + dx, at.y + dy, at.z + dz)).name);

    let power = 0;
    for (let z = -1; z <= 1; z += 1) {
        for (let x = -1; x <= 1; x += 1) {
            if (x === 0 && z === 0) continue;
            if (!(await isEmpty(x, 0, z)) || !(await isEmpty(x, 1, z))) continue;

            power += await powerAt(x * 2, 0, z * 2);
            power += await powerAt(x * 2, 1, z * 2);

            // A diagonal reaches two more shelves each, which is why a full
            // ring is worth 15 rather than the 8 the cardinals alone give.
            if (x !== 0 && z !== 0) {
                power += await powerAt(x * 2, 0, z);
                power += await powerAt(x * 2, 1, z);
                power += await powerAt(x, 0, z * 2);
                power += await powerAt(x, 1, z * 2);
            }

            if (power >= MAX_BOOKSHELF_POWER) return MAX_BOOKSHELF_POWER;
        }
    }
    return power;
};
