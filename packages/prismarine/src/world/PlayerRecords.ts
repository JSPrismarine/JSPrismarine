/**
 * Which world a returning player's record puts them in.
 *
 * A save keeps one record per player, and the record says which dimension it was written in:
 * `WorldPlayerData.dimension`, Bedrock's `DimensionId` on disk. A login builds the player in the
 * default world, reads the record there, and moves them to the loaded world of that dimension
 * before anything else reads the record. Before the field existed the record was looked for in
 * every loaded world and the newest `savedAt` won; a record from before this field has no
 * dimension and keeps the player where the login built them.
 */
import type Player from '../Player';
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
 * @param worlds - The loaded worlds the record's dimension may name, which the caller takes off
 *   the world manager.
 * @returns The record and the world holding its dimension, falling back to the player's own
 *   world when the record names no dimension or no loaded world has it.
 */
export const lastPlayerRecord = async (player: Player, worlds: readonly World[]): Promise<PlayerRecord> => {
    const here = player.getWorld();
    const data = await here.getPlayerData(player);
    const dimension = data.dimension;
    const world =
        dimension === undefined ? here : (worlds.find((world) => world.getDimension().id === dimension) ?? here);

    return { world, data, dimension };
};
