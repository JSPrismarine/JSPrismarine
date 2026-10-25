/**
 * Which world a returning player's record is in.
 *
 * Every world keeps its own player records - the LevelDB provider writes a `player_server_` key
 * into that world's database - and a login builds the player in the default world and reads the
 * record out of it. A player who logged out of the nether therefore came back in the overworld,
 * at whatever position the overworld's own stale record held, with the inventory that record
 * carried rather than the one they left with.
 *
 * So the record is looked for in every loaded world and the newest one wins.
 * `WorldPlayerData.savedAt` is the instant it was written, and a record from before that field
 * existed counts as older than any record that carries one. One provider read per world per
 * login, and this server loads one world per dimension.
 */
import type Player from '../Player';
import type { World, WorldPlayerData } from './World';

/** A player's record and the world it was read out of. */
export interface PlayerRecord {
    readonly world: World;
    readonly data: Partial<WorldPlayerData>;
}

/**
 * The most recently written record for one player, across every loaded world.
 *
 * @param player - Whose record to look for; its current world is the fallback.
 * @param worlds - Every loaded world, which the caller takes off the world manager.
 * @returns The record and the world holding it, falling back to the player's own world when no
 *   world has a record with an instant on it.
 */
export const lastPlayerRecord = async (player: Player, worlds: readonly World[]): Promise<PlayerRecord> => {
    const here = player.getWorld();
    const read = await Promise.all(
        worlds.map(async (world) => ({ world, data: await world.getPlayerData(player) }) satisfies PlayerRecord)
    );

    let best: PlayerRecord | undefined;
    for (const record of read) {
        const at = record.data.savedAt;
        if (at === undefined) continue;
        if (best === undefined || at > (best.data.savedAt ?? 0)) best = record;
    }

    if (best !== undefined) return best;

    // No record anywhere carries an instant: either this is a first join, or every record
    // predates the field. Reading the player's own world is what this server always did.
    return read.find((record) => record.world === here) ?? { world: here, data: await here.getPlayerData(player) };
};
