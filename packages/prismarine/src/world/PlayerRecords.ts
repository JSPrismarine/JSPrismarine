/**
 * Which world a returning player's record puts them in.
 *
 * A save keeps one record per player, and the record says which dimension it was written in:
 * `WorldPlayerData.dimension`, Bedrock's `DimensionId` on disk. A login builds the player in the
 * default world, reads the record there, and moves them to that dimension's world, built by the
 * level if its stem is lazy, before anything else reads the record. Before the field existed
 * the record was looked for in every loaded world and the newest `savedAt` won; a record from
 * before this field has no dimension and keeps the player where the login built them.
 */
import type Player from '../Player';
import type { Level } from './Level';
import type { World, WorldPlayerData } from './World';

/** A player's record and the world it puts the player in. */
export interface PlayerRecord {
    readonly world: World;
    readonly data: Partial<WorldPlayerData>;
    /** The Java id of the dimension the record was written in, or undefined on an older record. */
    readonly dimension: string | undefined;
}

/**
 * The record for one player, and the world its dimension names.
 *
 * @param player - Whose record to read; its current world is where the record is read from and
 *   the fallback when the record names no dimension.
 * @param level - The level the record belongs to, which builds the dimension's world when it
 *   has a stem for it and the world is not loaded yet.
 * @returns The record and the world holding its dimension, falling back to the player's own
 *   world when the record names no dimension or one the level has no stem for. The second
 *   case is logged as a warning, since the player comes back in another dimension than the
 *   one they left.
 */
export const lastPlayerRecord = async (player: Player, level: Level): Promise<PlayerRecord> => {
    const here = player.getWorld();
    const data = await here.getPlayerData(player);
    const dimension = data.dimension;
    if (dimension === undefined) return { world: here, data, dimension };

    if (!level.getStems().has(dimension)) {
        level
            .getServer()
            .getLogger()
            .warn(
                `The record for ${here.getName()}'s player names the dimension ${dimension}, which the level has no stem for; keeping the player in ${here.getName()}`
            );
        return { world: here, data, dimension };
    }

    return { world: await level.world(dimension), data, dimension };
};
