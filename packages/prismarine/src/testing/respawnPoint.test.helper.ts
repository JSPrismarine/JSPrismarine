import type PlayerSession from '../network/PlayerSession';
import type { RespawnDestination } from '../network/PlayerSession';

/**
 * Where a player comes back, asked as a trip out of the End asks: again after each turn of the
 * event loop, which lets the chunks and worlds the search waits for arrive, until it answers.
 *
 * @param session - The player's session.
 * @throws When the search has not answered after a hundred attempts.
 */
export const respawnPointOf = async (session: PlayerSession): Promise<RespawnDestination> => {
    for (let attempts = 0; attempts < 100; attempts += 1) {
        const destination = session.attemptRespawnPoint();
        if (destination !== undefined) return destination;
        await new Promise<void>((resolve) => setImmediate(resolve));
    }
    throw new Error(`The respawn search never answered for ${session.identity.name}`);
};
