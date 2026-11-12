import type PlayerSession from '../network/PlayerSession';
import type { RespawnDestination } from '../network/PlayerSession';

/**
 * Where a player comes back, asked as a trip out of the End asks: again after each turn of the
 * event loop, which lets the chunks and worlds the search waits for arrive, until it answers.
 *
 * No count of turns bounds the wait: a chunk load or a world build does not finish in a known
 * number of them. The test's own timeout does.
 *
 * @param session - The player's session.
 */
export const respawnPointOf = async (session: PlayerSession): Promise<RespawnDestination> => {
    for (;;) {
        const destination = session.attemptRespawnPoint();
        if (destination !== undefined) return destination;
        await new Promise<void>((resolve) => setImmediate(resolve));
    }
};
